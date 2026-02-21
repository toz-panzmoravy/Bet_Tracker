import base64
import logging
from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.llm.client import parse_ticket_image
from app.schemas import OcrResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ocr", tags=["OCR Import"])


class Base64ImageRequest(BaseModel):
    image: str


@router.post("/parse", response_model=OcrResponse)
async def ocr_parse(file: UploadFile = File(...)):
    """Nahrání screenshotu tiketu → OCR → parsovaná data."""
    try:
        contents = await file.read()
        image_b64 = base64.b64encode(contents).decode("utf-8")
        result = await parse_ticket_image(image_b64)
        return OcrResponse(**result)
    except Exception as e:
        logger.error(f"OCR parse error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR chyba: {str(e)}")


@router.post("/parse-base64", response_model=OcrResponse)
async def ocr_parse_base64(data: Base64ImageRequest):
    """Parsování base64 obrázku (pro Ctrl+V paste)."""
    try:
        image_b64 = data.image
        # Odstranit data URI prefix pokud existuje
        if "base64," in image_b64:
            image_b64 = image_b64.split("base64,")[1]

        logger.info(f"OCR: Přijatý obrázek, velikost base64: {len(image_b64)} znaků")
        result = await parse_ticket_image(image_b64)
        logger.info(f"OCR: Rozpoznáno {len(result.get('tickets', []))} tiketů")
        return OcrResponse(**result)
    except Exception as e:
        logger.error(f"OCR parse-base64 error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR chyba: {str(e)}")
