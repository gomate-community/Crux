import os
import random
import threading
import pandas as pd
import numpy as np

DF = None
data_load_lock = threading.Lock()

def load_data():
    global DF
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "arxiv-metadata-oai-snapshot.parquet")
    if not os.path.exists(file_path):
        file_path = "arxiv-metadata-oai-snapshot.parquet"

    if DF is None:
        with data_load_lock:
            if DF is None:
                print(f"正在从 Parquet 文件加载数据 ({file_path})...")
                DF = pd.read_parquet(file_path)
                print(f"成功加载 {len(DF)} 条数据")
    return DF

def get_random_record():
    df = load_data()
    total_len = len(df)
    idx = random.randint(0, total_len - 1)
    row = df.iloc[idx].to_dict()
    
    def clean_obj(obj):
        if isinstance(obj, np.ndarray):
            return [clean_obj(item) for item in obj.tolist()]
        if isinstance(obj, list):
            return [clean_obj(item) for item in obj]
        if isinstance(obj, dict):
            return {k: clean_obj(v) for k, v in obj.items()}
        if isinstance(obj, np.generic):
            return obj.item()
        if pd.isna(obj):
            return None
        return obj

    cleaned_row = clean_obj(row)
    return cleaned_row
