import os
import json
from flask import Flask, jsonify, render_template, request

from config import get_llm_config
from data_manager import get_random_record
from llm_service import is_paper_suitable_for_query
from task_worker import start_worker, add_task, get_status

class ArxivJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        import numpy as np
        import pandas as pd
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        if pd.isna(obj): return None
        return super().default(obj)

app = Flask(__name__)

try:
    from flask.json.provider import DefaultJSONProvider
    class CustomJSONProvider(DefaultJSONProvider):
        def default(self, obj):
            import numpy as np
            import pandas as pd
            if isinstance(obj, np.integer): return int(obj)
            if isinstance(obj, np.floating): return float(obj)
            if isinstance(obj, np.ndarray): return obj.tolist()
            if pd.isna(obj): return None
            return super().default(obj)
    app.json = CustomJSONProvider(app)
except ImportError:
    app.json_encoder = ArxivJSONEncoder 

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/evaluate_paper', methods=['POST'])
def evaluate_paper():
    try:
        data = request.get_json()
        print(f"\n[LLM 手动评估] 正在验证论文的适用性: 《{data.get('title')}》")
        is_suitable, reason = is_paper_suitable_for_query(data)
        print(f"[LLM 手动评估] 结果: {'✅ 适合' if is_suitable else '❌ 不适合'} | 原因: {reason}\n")
        return jsonify({"suitable": is_suitable, "reason": reason})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/random')
def get_random():
    try:
        return jsonify(get_random_record())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate_and_save', methods=['POST'])
def generate_and_save():
    try:
        data = request.get_json()
        prompt = data.get('prompt')
        title = data.get('title', '未知论文')
        if not prompt: return jsonify({"error": "Prompt is empty"}), 400
        q_size = add_task(prompt, title)
        short_title = title if len(title) <= 20 else title[:20] + "..."
        return jsonify({"message": f"《{short_title}》已入队 (排队: {q_size})"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/poll_results')
def poll_results():
    return jsonify(get_status())

if __name__ == '__main__':
    start_worker()
    app.run(debug=False, use_reloader=False, port=5050)
