# ADR-0003 Action은 Operation의 집합이고 분석 불가는 1급 결과다

Status: accepted (Target + V1). 출처: docs/design.md 34장.

- Context: Bash 입력의 25.9%가 다른 언어 program을 포함하고 91.3%가 복합 명령이었다.
- Decision: tool call을 Operation 목록으로 분해하고 Action의 Effect는 가장 제한적인 Operation을 따른다. 인식하지 못한 조각은 `execute` + `none`이다. classifier는 순수 함수이고 결과에 `classifierVersion`을 붙여 저장한다. Zone은 저장하지 않고 평가할 때 계산한다.
- Alternatives: 명령 문자열 prefix 매칭. replay할 때마다 다시 분류. LLM으로 의미 추정.
- Consequences: 복합 명령으로 제한을 우회하는 분류가 구조적으로 막힌다. Environment Profile을 바꾼 candidate를 재분류 없이 replay할 수 있다. 분류 규칙이 바뀌면 reclassify job이 필요하다.
- Reversal trigger: `analyzability: none` 비율이 40%를 넘어 diff가 의미를 잃을 때.
