import pandas as pd
import json

# 指向你的那个超长文件名的 Excel 文件
file_path = "data/IPIP-NEO-300_Items_sorted_with_scoring_checked_CN_context_split3_itemanchor_after_response.xlsx"

try:
    # 明确指定读取 'Test_Sorted' 这个 sheet
    df = pd.read_excel(file_path, sheet_name='Test_Sorted')
    
    questions = []
    answers = {}

    for index, row in df.iterrows():
        q_num = int(row["Number"])
        
        # 构建题库（严格保持原有的字段和提取逻辑不变）
        questions.append({
            "Number": q_num,
            "Sign": str(row["Sign"]).strip(),
            "Facet": str(row["Facet / 分面(隐藏)"]).strip(),
            "Item": str(row["Chinese Translated Item with Subject."]).strip(),
            "Anchor": str(row["Item_Anchor（题目锚点）"]).strip()
        })
        
        # 提取作答进度
        # 使用 .get() 防止该列出现空缺时代码直接崩溃
        response = row.get("Response (1-5) / 作答(1-5)")
        if pd.notna(response):
            val = float(response)
            answers[q_num] = int(val) if val.is_integer() else val

    # 1. 导出完整的题库 JSON
    with open("data/questions.json", "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    # 2. 导出作答进度 JSON
    with open("data/answers.json", "w", encoding="utf-8") as f:
        json.dump(answers, f, ensure_ascii=False, indent=2)

    print("🎉 转换成功！")
    print(f"✅ 生成题库：data/questions.json (共 {len(questions)} 题)")
    print(f"✅ 提取进度：data/answers.json (已完成 {len(answers)} 题)")

except Exception as e:
    print(f"❌ 发生错误: {e}")