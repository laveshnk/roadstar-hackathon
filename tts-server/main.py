import io
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from kokoro import KPipeline
from pydantic import BaseModel

app = FastAPI(title="Apex Corridor Neural Voice Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Kokoro-82M pipeline for American English.
# 'af_heart' provides natural, human-grade dispatcher narration.
pipeline = KPipeline(lang_code='a')


class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart"
    speed: float = 1.0


@app.get("/health")
def health():
    return {"status": "ok", "service": "kokoro-tts", "port": 5050}


@app.post("/synthesize")
def synthesize(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        generator = pipeline(
            req.text, voice=req.voice, speed=req.speed, split_pattern=r'\n+'
        )
        audio_segments = []
        for _, _, audio in generator:
            audio_segments.append(audio)

        if not audio_segments:
            raise HTTPException(status_code=500, detail="No audio generated")

        combined = np.concatenate(audio_segments)
        buf = io.BytesIO()
        sf.write(buf, combined, 24000, format='WAV')
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
