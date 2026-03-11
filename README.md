# Auto Clipper (Gemini + FFmpeg)

## Requisitos
- Node.js 18+
- Python 3.10+
- FFmpeg en PATH
- API key de Gemini (Google AI Studio)

## Configuración
- Copia `.env.example` a `.env` y coloca `GEMINI_API_KEY`.

## Instalar
- `npm install`
- `pip install -r scripts/requirements.txt`

## Ejecutar
- `npm run dev`

## API
- `POST /api/jobs` (multipart form-data) campo `video`
- `GET /api/jobs/:jobId`
