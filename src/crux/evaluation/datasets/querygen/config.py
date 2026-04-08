import os
import json

def get_llm_config():
    api_key = os.environ.get("LLM_API_KEY", "your-api-key")
    api_base = os.environ.get("LLM_API_BASE", "https://api.openai.com/v1")
    model_name = os.environ.get("LLM_MODEL", "gpt-3.5-turbo")
    
    config_path = os.path.join(os.path.dirname(__file__), "config.json")
    if not os.path.exists(config_path):
        config_path = "config.json"

    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config_data = json.load(f)
                api_key = config_data.get("LLM_API_KEY", api_key)
                api_base = config_data.get("LLM_API_BASE", api_base)
                model_name = config_data.get("LLM_MODEL", model_name)
        except Exception as e:
            print(f"配置文件读取失败: {e}")
            
    api_base = api_base.rstrip('/')
    return api_key, api_base, model_name
