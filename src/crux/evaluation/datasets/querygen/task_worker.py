import queue
import threading
from llm_service import generate_and_select_query_for_paper

generation_queue = queue.Queue()
completion_results = []
results_lock = threading.Lock()
current_processing_title = None

def generation_worker():
    global current_processing_title
    while True:
        task = generation_queue.get()
        if task is None:
            break
            
        prompt = task.get('prompt')
        title = task.get('title', '未知论文')
        
        current_processing_title = title
        
        short_title = title if len(title) <= 20 else title[:20] + "..."
        print(f"\n[后台队列] 开始处理新任务: 《{short_title}》 (剩余等待: {generation_queue.qsize()})")
        
        result_msg, is_err = generate_and_select_query_for_paper(prompt, title)
        
        with results_lock:
            completion_results.append({
                "title": title,
                "message": result_msg,
                "isError": is_err
            })
            current_processing_title = None
            generation_queue.task_done()

def start_worker():
    threading.Thread(target=generation_worker, daemon=True).start()

def add_task(prompt, title):
    generation_queue.put({'prompt': prompt, 'title': title})
    return generation_queue.qsize()

def get_status():
    with results_lock:
        data = list(completion_results)
        completion_results.clear()
        
    q_items = list(generation_queue.queue)
    queued_titles = [i.get('title', '未知论文') for i in q_items]
    
    return {
        "results": data,
        "queue_size": len(q_items),
        "queued_titles": queued_titles,
        "current_processing": current_processing_title
    }
