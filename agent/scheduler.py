import asyncio
import logging
from core.services.image_preprocessor import process_and_split_to_base64
from agent.services.glm_service import GLMService
from agent.services.result_saver import save_result

logger = logging.getLogger("agent.scheduler")


async def scheduler_loop(engine):
    logger.info("Scheduler started")
    glm = GLMService()

    while engine.state == "processing":
        task = await engine.queue.get()
        if task is None:
            break

        try:
            logger.info(f"Processing task {task.id}: {task.file_path}")

            loop = asyncio.get_event_loop()
            image_chunks, num_chunks = await loop.run_in_executor(
                None, process_and_split_to_base64, task.file_path
            )
            logger.info(f"Preprocessed into {len(image_chunks)} chunk(s)")

            # Step 1: GLM-4.5V extracts questions + diagram flags
            result = await glm.process_image(image_chunks)
            logger.info(f"Detected subject: {result.get('subject', '?')}, "
                        f"questions: {len(result.get('questions', []))}")

            # Step 2: Save as worksheet-format Markdown
            result_path = save_result(result)
            subject = result.get("subject", "未分类")
            logger.info(f"Saved: {result_path}")

            task.subject = subject
            task.status = "done"

            await engine.notify_all({
                "task_id": task.id,
                "source": task.source,
                "subject": subject,
                "questions": len(result.get("questions", [])),
                "file_path": str(result_path),
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
