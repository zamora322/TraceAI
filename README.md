# ⚡ TraceAI

> **Vectorización inteligente de imágenes a SVG impulsada por IA y algoritmos avanzados.**

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js%2014%2B-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Python](https://img.shields.io/badge/Python%203.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

---

## 📌 Descripción del Proyecto

**TraceAI** es una plataforma SaaS diseñada para convertir imágenes rasterizadas (mapas de bits como PNG, JPG, WEBP) en vectores SVG limpios, escalables y optimizados para producción. Combinando la velocidad del motor de vectorización de alto rendimiento (`vtracer`) con una interfaz moderna y reactiva, TraceAI permite a diseñadores, desarrolladores y creadores vectorizar recursos gráficos en cuestión de segundos.

---

## 🏗️ Arquitectura del Sistema

El proyecto está diseñado bajo una arquitectura modular desacoplada:

```mermaid
graph TD
    User([Usuario / Navegador]) -->|HTTP / FormData| Frontend[Frontend: Next.js + Tailwind CSS + TypeScript]
    Frontend -->|POST /api/vectorize| Backend[Backend: FastAPI + Python 3.12]

    subgraph Pipeline ["Pipeline de IA Profesional"]
        Backend -->|Paso A: remove_background| RemBG["Paso A: rembg (IA)<br>Aislamiento de sujeto y fondo transparente"]
        RemBG -->|Paso B: color_count| Quant["Paso B: scikit-learn (K-Means)<br>Cuantización a paleta fija o Mean Shift"]
        Quant -->|Paso C: detail_level| Engine["Paso C: vtracer<br>Vectorización dinámica adaptativa"]
    end

    Engine -->|Salida SVG optimizada| Backend
    Backend -->|Stream / Payload SVG| Frontend
    Frontend -->|Renderizado y Descarga| User
```

### Stack Tecnológico

| Capa | Tecnologías | Propósito |
| :--- | :--- | :--- |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), Python 3.12, [rembg](https://github.com/danielgatis/rembg), [scikit-learn](https://scikit-learn.org/), [OpenCV](https://opencv.org/), [Pillow](https://python-pillow.org/), [vtracer](https://github.com/visioncortex/vtracer) | Pipeline de IA profesional: eliminación de fondos, cuantización K-Means, filtrado de contornos y vectorización adaptativa. |
| **Frontend** | [Next.js](https://nextjs.org/) (App Router), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) | Interfaz SaaS reactiva, zona interactiva de drag & drop, comparativa visual Antes/Después en tiempo real y descarga de SVG. |

---

## 📁 Estructura del Monorepo

```text
TraceAI/
├── .gitignore               # Configuración global de exclusiones Git
├── README.md                # Documentación principal del proyecto
├── backend/                 # Servicio API en FastAPI
│   ├── .gitignore           # Exclusiones específicas de Python y venv
│   ├── main.py              # Punto de entrada de la API y configuración CORS
│   ├── requirements.txt     # Dependencias de Python
│   └── venv/                # Entorno virtual de Python
└── frontend/                # Aplicación Web en Next.js
    ├── app/                 # Rutas y páginas (Next.js App Router)
    │   ├── globals.css      # Estilos globales y Tailwind CSS
    │   ├── layout.tsx       # Layout raíz
    │   └── page.tsx         # Landing Page de TraceAI
    ├── package.json         # Dependencias y scripts de Node.js
    ├── tailwind.config.ts   # Configuración de Tailwind CSS
    └── tsconfig.json        # Configuración de TypeScript
```

---

## 🚀 Guía de Inicio Rápido (Desarrollo Local)

### Prerrequisitos

Asegúrate de tener instalados los siguientes componentes en tu entorno:
- **Python:** 3.10 o superior (recomendado 3.12+)
- **Node.js:** 18.x o superior (recomendado 20+ o 24+)
- **npm**, **pnpm** o **yarn**
- **Git**

---

### 1. Configurar y Levantar el Backend

1. Dirígete a la carpeta `backend`:
   ```bash
   cd backend
   ```

2. Crea y activa el entorno virtual de Python:
   - **Linux / macOS:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
   - **Windows:**
     ```powershell
     python -m venv venv
     venv\Scripts\activate
     ```

3. Instala las dependencias del proyecto:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. Inicia el servidor de desarrollo con Uvicorn:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

5. Verifica el estado del servicio:
   - Endpoint de salud: [http://localhost:8000/](http://localhost:8000/)
   - Documentación Swagger interactiva: [http://localhost:8000/docs](http://localhost:8000/docs)
   - Documentación Redoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### 2. Configurar y Levantar el Frontend

1. Dirígete a la carpeta `frontend`:
   ```bash
   cd frontend
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

4. Abre tu navegador en:
   - [http://localhost:3000](http://localhost:3000)

---

### 🧪 Guía de Pruebas del Frontend (Flujo Interactivo)

Con ambos servicios en ejecución (Backend en `http://localhost:8000` y Frontend en `http://localhost:3000`), puedes validar el funcionamiento de extremo a extremo:

1. **Subida Interactiva (Drag & Drop o Explorador):**
   - Arrastra una imagen (`.png`, `.jpg` o `.jpeg`) sobre la zona central con bordes punteados. Observa cómo el recuadro reacciona visualmente con iluminación cian y escala suave.
   - O haz clic sobre el área para seleccionar la imagen mediante el explorador de archivos.

2. **Indicador de Procesamiento con IA:**
   - Observa la transición al estado de carga animado con el mensaje *"Procesando imagen con IA..."* y el flujo de etapas (*Preprocesamiento OpenCV → Vectorización VTracer*).

3. **Comparador "Antes y Después":**
   - Una vez procesado el archivo, la vista se actualiza automáticamente mostrando:
     - **Antes (Original):** Imagen en mapa de bits con su peso y formato original.
     - **Después (SVG Vectorial):** Renderizado vectorial en tiempo real sobre una cuadrícula que permite apreciar recortes y transparencias limpias.

4. **Descarga del Archivo SVG:**
   - Haz clic en **"Descargar SVG"** para guardar el archivo `.svg` directamente en tu disco local.
   - Puedes abrir el SVG descargado en cualquier navegador, editor de código o software como Figma e Illustrator para comprobar la nitidez y escalabilidad infinita de los trazos.

5. **Reinicio de Estados:**
   - Pulsa **"Vectorizar otra imagen"** para reiniciar los estados y liberar recursos de memoria (`URL.revokeObjectURL`).

6. **Comprobación de Errores y Seguridad:**
   - Prueba a subir un archivo no soportado (como un archivo de texto o ejecutable) para comprobar que el banner de alerta amigable informa el error de forma clara sin romper la aplicación.
   - Detén temporalmente el backend para validar el mensaje de servidor no disponible.

---

## 🔌 Endpoints de la API

| Método | Endpoint | Parámetros / Payload | Descripción | Respuesta Ejemplo |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | Ninguno | Verificación de estado del servicio (Health Check). | `{"status": "TraceAI Backend API Online"}` |
| `POST` | `/api/vectorize` | `multipart/form-data`<br>• `file`: Imagen (PNG, JPG, WEBP, BMP, máx 15MB)<br>• `remove_background`: `bool` (opcional, def: `false`)<br>• `color_count`: `int` (opcional, `0`=automático, `2..64` paleta fija K-Means)<br>• `detail_level`: `'low'` \| `'medium'` \| `'high'` (def: `'medium'`) | Pipeline profesional de IA: remoción de fondo con IA (`rembg`), cuantización de paleta con K-Means (`scikit-learn`), agrupamiento de color Mean Shift y vectorización adaptativa (`vtracer`). | Archivo SVG descargable (`image/svg+xml`) con cabecera `Content-Disposition`. |

---

## 🛠️ Buenas Prácticas y Flujo de Trabajo

- **Variables de Entorno:** Nunca confirmes archivos `.env` al repositorio. Utiliza `.env.example` para documentar claves requeridas.
- **Formato y Calidad de Código:**
  - Backend: `black`, `flake8` o `ruff`
  - Frontend: `ESLint` y `Prettier`
- **Ramas:** Se recomienda usar el flujo `feature/nombre-de-funcionalidad` o `fix/nombre-del-bug` hacia `main`.

---

## 📄 Licencia

Este proyecto se distribuye bajo la licencia MIT.
