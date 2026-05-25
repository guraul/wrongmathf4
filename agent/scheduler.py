import asyncio
import logging
from core.services.file_processor import process_file
from core.services.ocr_service import OCRService
from agent.services.llm_service import LLMService
from agent.services.result_saver import save_result

logger = logging.getLogger("agent.scheduler")


async def scheduler_loop(engine):
    logger.info("Scheduler started")
    ocr_service = OCRService()
    llm_service = LLMService()

    while engine.state == "processing":
        task = await engine.queue.get()
        if task is None:
            break

        try:
            logger.info(f"Processing task {task.id}: {task.file_path}")

            loop = asyncio.get_event_loop()
            images, num_pages = await loop.run_in_executor(None, process_file, task.file_path)
            logger.info(f"Extracted {len(images)} images")

            raw_text = await ocr_service.recognize_text(images)
            logger.info(f"OCR result: {len(raw_text)} chars")

            verified = await llm_service.verify(raw_text)
            logger.info(f"Detected subject: {verified['subject']}")

            result_path = await save_result(task, verified, raw_text)
            task.subject = verified["subject"]
            task.status = "done"

            await engine.notify_all({
                "task_id": task.id,
                "source": task.source,
                "subject": verified["subject"],
                "questions": len(verified.get("questions", [])),
                "file_path": result_path,
            })

        except Exception as e:
            task.attempts += 1
            logger.error(f"Task {task.id} failed (attempt {task.attempts}): {e}")
            if task.attempts < task.max_retries:
                await asyncio.sleep(2 ** task.attempts)
                await engine.queue.put(task)
            else:
                task.status = "failed"
                await engine.notify_all({
                    "task_id": task.id,
                    "source": task.source,
                    "error": str(e),
                })
        finally:
            engine.queue.task_done(task)

    logger.info("Scheduler stopped")
