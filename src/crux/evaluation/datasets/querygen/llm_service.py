import re
import csv
import json
import os
import datetime
import requests
from config import get_llm_config

def is_paper_suitable_for_query(row):
    try:
        abstract = str(row.get('abstract', '')).strip()
        if len(abstract) < 50:
            return False, "摘要过短，机械规则前置过滤"

        api_key, api_base, model_name = get_llm_config()
        
        current_year = datetime.datetime.now().year
        prompt = (
            f"当前系统年份是 {current_year} 年。请评估以下 arXiv 论文是否适合作为生成“论文检索查询问题”的灵感源。\n"
            "判断不适合的标准如下，请你结合论文的领域类别和具体研究内容进行灵活、智能的判断：\n"
            "1. 论文发表时间与领域发展速度的匹配度。请你自行分析该细分领域的迭代速度：\n"
            "   - 对于新兴、快速迭代或高速发展的细分方向（如大模型、前沿生物技术、量子计算等任何快速发展学科），审查要从严，要求尽量在 2020 年及以后发表。\n"
            "   - 对于发展相对缓慢、注重基础理论或传统的方法的分支（无论是数学、物理还是 CS 中的传统基础理论分支），时间要求可适当放宽，但最多放宽至 2009 年及以后。\n"
            "   - 绝对不接受 2009 年以前的古早论文。\n"
            "2. 即使论文日期较新，如果明确探讨的是已被业界公认淘汰、过时或不再具有研究价值的技术论题，也应视为不适合。\n"
            "3. 摘要内容过短、过于空洞或缺乏具体的研究实体/概念，难以激起生成自然查询问题的灵感。\n\n"
            "请根据上述条件对以下论文进行分析：\n"
            f"标题：{row.get('title')}\n"
            f"日期：{row.get('update_date')}\n"
            f"领域类别：{row.get('categories')}\n"
            f"摘要：{abstract}\n\n"
            "请严格输出 JSON，不要添加多余 Markdown 格式，格式如下：\n"
            "{\n"
            '  "suitable": true 或 false,\n'
            '  "reason": "你的判断理由，请简要说明"\n'
            "}"
        )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "你是一个专业的学术评价助手。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.3
        }

        response = requests.post(f"{api_base}/chat/completions", headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        
        reply_json = response.json()
        ai_content = reply_json.get('choices', [{}])[0].get('message', {}).get('content', '')
        
        json_str = re.sub(r'^```json\s*|```\s*$', '', ai_content.strip(), flags=re.MULTILINE)
        parsed_data = json.loads(json_str)
        
        is_suitable = bool(parsed_data.get('suitable', False))
        reason = parsed_data.get('reason', 'JSON中无理由')
        
        return is_suitable, reason
        
    except Exception as e:
        return False, f"LLM评估发生错误: {e}"

def generate_and_select_query_for_paper(prompt, title):
    try:
        api_key, api_base, model_name = get_llm_config()
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # 第一阶段：生成问题
        payload_stage1 = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "你是一个专业的学术和研究助理。"},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7
        }

        response1 = requests.post(f"{api_base}/chat/completions", headers=headers, json=payload_stage1, timeout=60)
        response1.raise_for_status()
        
        reply_json1 = response1.json()
        choices1 = reply_json1.get('choices')
        if not choices1 or not isinstance(choices1, list) or len(choices1) == 0:
            return "API 接口第1阶段返回格式异常或包含错误", True
            
        ai_content1 = choices1[0].get('message', {}).get('content')
        if not ai_content1:
            return "大模型第1阶段返回了空内容", True
            
        print("\n" + "="*40 + " API 第1阶段生成内容 " + "="*40)
        print(f"模型 ({model_name}) 返回候选问题：\n{ai_content1}")
        
        prompt_stage2 = (
            "以上是你根据论文元数据生成的这三个候选检索问题。\n"
            "现在请对这三个问题进行分析，评估它们各自是否满足作为优秀检索提问的要求（例如通用性、搜索意图代表性等，时间限制不作为评价依据）。\n"
            "最后经过分析，选出一个符合要求且最终能被用来评估系统效果的问题。若都比较好，可随机选取一个。\n\n"
            "请严格按照以下 JSON 数据结构输出你的回答结果，必须是一段可解析的 JSON，不需要包含任何 Markdown block 或是其他额外解释：\n"
            "{\n"
            '  "candidate_questions": ["问题1", "问题2", "问题3"],\n'
            '  "analysis": "用一段连贯的话对这三个问题的优劣势和特点进行分析",\n'
            '  "selected_question": "最终选出的那一个问题"\n'
            "}"
        )
        
        payload_stage2 = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": "你是一个专业的学术和研究助理。严格按照用户要求输出JSON格式。"},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": ai_content1},
                {"role": "user", "content": prompt_stage2}
            ],
            "temperature": 0.7
        }

        response2 = requests.post(f"{api_base}/chat/completions", headers=headers, json=payload_stage2, timeout=60)
        response2.raise_for_status()
        
        reply_json2 = response2.json()
        choices2 = reply_json2.get('choices')
        if not choices2 or not isinstance(choices2, list) or len(choices2) == 0:
            return "API 接口第2阶段返回格式异常或包含错误", True
            
        ai_content2 = choices2[0].get('message', {}).get('content')
        if not ai_content2:
            return "大模型第2阶段返回了空内容", True

        print("\n" + "="*40 + " API 第2阶段生成内容 " + "="*40)
        print(f"模型 ({model_name}) 返回最终分析结果：\n{ai_content2}")
        print("="*94 + "\n")

        try:
            json_str = re.sub(r'^```json\s*|```\s*$', '', ai_content2.strip(), flags=re.MULTILINE)
            parsed_data = json.loads(json_str)
            selected_q = parsed_data.get('selected_question')
        except json.JSONDecodeError:
            return f"AI 返回的内容不是有效的 JSON 格式\n原文: {ai_content2}", True

        if not selected_q:
            return f"JSON 中未找到 'selected_question' 字段\n原文: {ai_content2}", True

        csv_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "research_queries.csv")
        
        if not os.path.exists(os.path.dirname(csv_file)):
            csv_file = "research_queries.csv"
            
        file_exists = os.path.isfile(csv_file)
        
        with open(csv_file, mode='a', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['timestamp', 'query']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            
            timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            writer.writerow({
                'timestamp': timestamp,
                'query': selected_q
            })
            
        short_title = title if len(title) <= 20 else title[:20] + "..."
        return f"《{short_title}》生成并保存成功:\n{selected_q}", False
        
    except requests.exceptions.RequestException as e:
        raw_text = e.response.text if getattr(e, 'response', None) is not None else ""
        return f"《{title}》请求失败: {str(e)} | 原文: {raw_text}", True
    except Exception as e:
        return f"《{title}》发生系统异常: {str(e)}", True

