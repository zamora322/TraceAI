"""
Servicio de exportación CAD/CAM y multipista para TraceAI.
Permite convertir gráficos vectoriales SVG a formato industrial DXF (AutoCAD R2010)
y separar el diseño por capas de color independientes en un archivo .zip para serigrafía y corte.
"""

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
import ezdxf
from ezdxf.colors import rgb2int
import svgpathtools


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    """Convierte un color hexadecimal (#RGB o #RRGGBB) a tupla (R, G, B)."""
    hex_clean = hex_str.strip().lstrip("#")
    if len(hex_clean) == 3:
        hex_clean = "".join([c * 2 for c in hex_clean])
    if len(hex_clean) == 6:
        try:
            return (
                int(hex_clean[0:2], 16),
                int(hex_clean[2:4], 16),
                int(hex_clean[4:6], 16),
            )
        except ValueError:
            pass
    return (128, 128, 128)


def _sanitize_color_name(hex_color: str) -> str:
    """Genera un identificador limpio y seguro para nombres de capa y archivos."""
    clean = re.sub(r"[^0-9a-zA-Z]", "", hex_color).upper()
    return clean if clean else "DEFAULT"


def _extract_svg_paths_by_color(
    svg_content: str,
) -> tuple[dict[str, list[dict]], dict[str, str]]:
    """
    Parsea el contenido XML de un SVG y agrupa los elementos <path> por su color de relleno (fill).

    Returns:
        Tupla con:
          - Diccionario {color_hex: [{"d": path_d, "fill": color_hex}, ...]}
          - Atributos raíz del elemento <svg> (viewBox, width, height, etc.)
    """
    root = ET.fromstring(svg_content)

    svg_attrs = {}
    for key, val in root.attrib.items():
        local_key = key.split("}")[-1] if "}" in key else key
        svg_attrs[local_key] = val

    paths_by_color = defaultdict(list)

    # Buscar todos los elementos path ignorando namespaces XML
    for elem in root.iter():
        tag = elem.tag.split("}")[-1] if "}" in elem.tag else elem.tag
        if tag.lower() == "path":
            d_attr = elem.attrib.get("d", "").strip()
            if not d_attr:
                continue
            fill_attr = elem.attrib.get("fill", "#000000").strip()
            if fill_attr.lower() in ("none", "transparent"):
                continue
            paths_by_color[fill_attr.upper()].append(
                {"d": d_attr, "fill": fill_attr.upper()}
            )

    return paths_by_color, svg_attrs


def convert_svg_to_dxf(svg_content: str) -> bytes:
    """
    Convierte un contenido SVG a archivo DXF (AutoCAD Release 2010).
    Cada color de relleno se mapea a una capa (layer) DXF independiente con color TrueColor.
    """
    paths_by_color, svg_attrs = _extract_svg_paths_by_color(svg_content)

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    # Intentar obtener la altura para inversión de coordenadas Y (estándar CAD)
    viewbox = svg_attrs.get("viewBox", "")
    height = 1000.0
    if viewbox:
        parts = [float(p) for p in re.split(r"[\s,]+", viewbox.strip()) if p]
        if len(parts) >= 4:
            height = parts[3]

    for color_hex, path_items in paths_by_color.items():
        layer_id = f"COLOR_{_sanitize_color_name(color_hex)}"
        r, g, b = _hex_to_rgb(color_hex)
        true_color = rgb2int((r, g, b))

        if layer_id not in doc.layers:
            layer = doc.layers.add(layer_id)
            layer.color = 7
            layer.true_color = true_color

        for item in path_items:
            try:
                parsed_path = svgpathtools.parse_path(item["d"])
                # Dividir el path en sub-trazos si contiene saltos (Move)
                subpaths = parsed_path.continuous_subpaths()
                for sub in subpaths:
                    points = []
                    for seg in sub:
                        # Muestrear segmentos curvos para convertirlos en polilíneas precisas
                        if isinstance(
                            seg,
                            (
                                svgpathtools.CubicBezier,
                                svgpathtools.QuadraticBezier,
                                svgpathtools.Arc,
                            ),
                        ):
                            steps = 8
                            for i in range(steps):
                                t = i / steps
                                pt = seg.point(t)
                                points.append((pt.real, height - pt.imag))
                        else:
                            start = seg.start
                            points.append((start.real, height - start.imag))

                    if sub:
                        end = sub[-1].end
                        points.append((end.real, height - end.imag))

                    if len(points) >= 2:
                        is_closed = sub.isclosed()
                        msp.add_lwpolyline(
                            points,
                            close=is_closed,
                            dxfattribs={"layer": layer_id},
                        )
            except Exception:
                continue

    out_stream = io.StringIO()
    doc.write(out_stream)
    return out_stream.getvalue().encode("utf-8")


def generate_single_color_svg(
    path_items: list[dict],
    svg_attrs: dict[str, str],
) -> str:
    """Genera un archivo SVG válido conteniendo únicamente los paths indicados."""
    width_attr = f'width="{svg_attrs["width"]}"' if "width" in svg_attrs else ""
    height_attr = f'height="{svg_attrs["height"]}"' if "height" in svg_attrs else ""
    viewbox_attr = f'viewBox="{svg_attrs["viewBox"]}"' if "viewBox" in svg_attrs else ""

    svg_header = (
        f'<svg xmlns="http://www.w3.org/2000/svg" {width_attr} {height_attr} {viewbox_attr}>\n'
    )
    svg_body = "".join(
        [f'  <path d="{p["d"]}" fill="{p["fill"]}" />\n' for p in path_items]
    )
    svg_footer = "</svg>\n"
    return svg_header + svg_body + svg_footer


def generate_multitrack_zip(svg_content: str, base_name: str = "vectorizado") -> bytes:
    """
    Genera un paquete ZIP con exportación multipista profesional:
      - svg_layers/: un SVG individual por color para serigrafía o corte por vinil.
      - dxf_layers/: un DXF individual por color para corte láser/CNC.
      - completo/: diseño consolidado en formatos SVG y DXF.
    """
    paths_by_color, svg_attrs = _extract_svg_paths_by_color(svg_content)

    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # 1. Agregar diseño consolidado
        zip_file.writestr(f"completo/{base_name}_completo.svg", svg_content)
        dxf_consolidado = convert_svg_to_dxf(svg_content)
        zip_file.writestr(f"completo/{base_name}_completo.dxf", dxf_consolidado)

        # 2. Agregar capas individuales por color
        idx = 1
        for color_hex, path_items in paths_by_color.items():
            color_name = _sanitize_color_name(color_hex)
            file_prefix = f"capa_{idx:02d}_{color_name}"

            # Capa SVG
            layer_svg = generate_single_color_svg(path_items, svg_attrs)
            zip_file.writestr(f"svg_layers/{file_prefix}.svg", layer_svg)

            # Capa DXF
            layer_dxf = convert_svg_to_dxf(layer_svg)
            zip_file.writestr(f"dxf_layers/{file_prefix}.dxf", layer_dxf)

            idx += 1

    zip_buffer.seek(0)
    return zip_buffer.getvalue()
