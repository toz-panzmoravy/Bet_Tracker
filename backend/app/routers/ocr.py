import asyncio
import base64
import logging
from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from app.llm.client import parse_ticket_image, check_ocr_health
from app.schemas import OcrResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ocr", tags=["OCR Import"])


class Base64ImageRequest(BaseModel):
    image: str
    bookmaker: str = "tipsport"


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
async def ocr_parse_base64(data: Base64ImageRequest, request: Request):
    """Parsování base64 obrázku (pro Ctrl+V paste). Při odpojení klienta se běh OCR zruší."""
    image_b64 = data.image
    if "base64," in image_b64:
        image_b64 = image_b64.split("base64,")[1]

    logger.info(f"OCR: Přijatý obrázek, velikost base64: {len(image_b64)} znaků, bookmaker: {data.bookmaker}")

    ocr_task = asyncio.create_task(parse_ticket_image(image_b64, data.bookmaker))

    try:
        while not ocr_task.done():
            if await request.is_disconnected():
                ocr_task.cancel()
                try:
                    await ocr_task
                except asyncio.CancelledError:
                    pass
                logger.info("OCR: Požadavek zrušen (klient odpojen).")
                raise HTTPException(status_code=499, detail="Client closed request")
            await asyncio.sleep(0.5)

        result = ocr_task.result()
        logger.info(f"OCR: Rozpoznáno {len(result.get('tickets', []))} tiketů")
        return OcrResponse(**result)
    except HTTPException:
        raise
    except asyncio.CancelledError:
        logger.info("OCR: Požadavek zrušen.")
        raise HTTPException(status_code=499, detail="Client closed request")
    except Exception as e:
        logger.error(f"OCR parse-base64 error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR chyba: {str(e)}")
@router.get("/health")
async def ocr_health(unload: bool = False):
    """Kontrola, zda OCR systém (Ollama) běží. 
    Pokud unload=true, pokusí se uvolnit model z paměti."""
    is_ok = await check_ocr_health(unload=unload)
    if is_ok:
        return {"status": "ok", "message": "OCR systém je připraven" if not unload else "Model byl uvolněn z paměti"}
    else:
        return {"status": "error", "message": "OCR systém (Ollama) neodpovídá nebo chybí model"}
