"""Claude API 스모크 테스트: API 키/SDK가 정상 동작하는지 확인."""
import os
import sys

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=100,
    messages=[{"role": "user", "content": "한 문장으로 인사해줘."}],
)

print("stop_reason:", response.stop_reason)
for block in response.content:
    if block.type == "text":
        print("text:", block.text)
print("usage:", response.usage)
