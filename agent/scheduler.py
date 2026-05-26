import asyncio
import logging
from core.services.image_preprocessor import process_and_split_to_base64
from agent.services.glm_service import GLMService
from agent.services.diagram_renderer import generate_tikz
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
            images, num_chunks = await loop.run_in_executor(
                None, process_and_split_to_base64, task.file_path
            )
            logger.info(f"Preprocessed into {len(images)} chunk(s)")

            # Step 1: GLM-4.5V → structured questions + diagram descriptions
            result = await glm.process_image(images)
            logger.info(f"Detected subject: {result.get('subject', '?')}, "
                        f"questions: {len(result.get('questions', []))}")

            # Step 2: Generate TikZ for questions with diagrams
            for q in result.get("questions", []):
                if q.get("has_diagram") and q.get("diagram"):
                    desc = q["diagram"].get("description", "")
                    labels = q["diagram"].get("labels", [])
                    if desc:
                        tikz = await generate_tikz(desc, labels)
                        q["tikz_code"] = tikz
                        logger.info(f"Generated diagram for Q{q['number']} "
                                    f"({'TikZ' if tikz else 'none'})")

            # Step 3: Save result
            result_path = await save_result(task, result)
            task.subject = result.get("subject", "未分类")
            task.status = "done"

            await engine.notify_all({
                "task_id": task.id,
                "source": task.source,
                "subject": result.get("subject"),
                "questions": len(result.get("questions", [])),
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
