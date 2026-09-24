-- Step 25: 대회 중심 홈 위치 기반 검색 좌표
ALTER TABLE tournaments ADD COLUMN latitude REAL;
ALTER TABLE tournaments ADD COLUMN longitude REAL;
