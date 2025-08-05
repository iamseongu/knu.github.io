const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// 미들웨어
app.use(cors());
app.use(express.json());

// 정적 파일 제공 (프론트엔드 빌드 파일)
app.use(express.static(path.join(__dirname, 'build')));

// 장소 설정
const LOCATIONS = {
    'gangnam': { name: '강남역', prize: '스타벅스 아메리카노', emoji: '☕' },
    'hongdae': { name: '홍대입구역', prize: '투썸플레이스 케이크', emoji: '🍰' },
    'myeongdong': { name: '명동역', prize: '이디야 아이스크림', emoji: '🍦' },
    'itaewon': { name: '이태원역', prize: '할리스 원두커피', emoji: '☕' },
    'jamsil': { name: '잠실역', prize: '메가커피 음료수', emoji: '🥤' }
};

// 데이터 저장 파일 경로
const DATA_DIR = path.join(__dirname, 'data');
const WINNERS_FILE = path.join(DATA_DIR, 'winners.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');

// 데이터 디렉토리 생성
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// 데이터 로드 함수
async function loadData(filePath, defaultValue = {}) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch {
        return defaultValue;
    }
}

// 데이터 저장 함수
async function saveData(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('데이터 저장 실패:', error);
    }
}

// API 라우트들

// 모든 장소 정보 조회
app.get('/api/locations', (req, res) => {
    res.json(LOCATIONS);
});

// 특정 장소 정보 조회
app.get('/api/locations/:locationId', async (req, res) => {
    const { locationId } = req.params;
    
    if (!LOCATIONS[locationId]) {
        return res.status(404).json({ error: '존재하지 않는 장소입니다.' });
    }
    
    const winners = await loadData(WINNERS_FILE);
    const hasWinner = !!winners[locationId];
    
    res.json({
        ...LOCATIONS[locationId],
        locationId,
        hasWinner,
        winnerTime: hasWinner ? winners[locationId].accessTime : null
    });
});

// 이벤트 참여
app.post('/api/participate', async (req, res) => {
    const { locationId, accessTime, userAgent } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || '127.0.0.1';
    
    if (!LOCATIONS[locationId]) {
        return res.status(400).json({ error: '존재하지 않는 장소입니다.' });
    }
    
    // 현재 데이터 로드
    const winners = await loadData(WINNERS_FILE);
    const logs = await loadData(LOGS_FILE, []);
    
    // 접속 기록 생성
    const accessLog = {
        id: Date.now(),
        locationId,
        accessTime,
        ip: clientIP,
        userAgent,
        timestamp: new Date().toISOString()
    };
    
    let isWinner = false;
    let winnerTime = null;
    
    // 선착순 확인
    if (!winners[locationId]) {
        // 첫 번째 접속자 - 당첨!
        winners[locationId] = {
            ...accessLog,
            winner: true
        };
        isWinner = true;
        
        console.log(`🎉 새로운 당첨자! ${LOCATIONS[locationId].name} - IP: ${clientIP}`);
        
        // 당첨자 데이터 저장
        await saveData(WINNERS_FILE, winners);
    } else {
        winnerTime = winners[locationId].accessTime;
        console.log(`😢 ${LOCATIONS[locationId].name} - 이미 당첨자 있음 - IP: ${clientIP}`);
    }
    
    // 로그에 기록 추가
    accessLog.isWinner = isWinner;
    logs.push(accessLog);
    
    // 최근 1000개만 유지
    if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
    }
    
    await saveData(LOGS_FILE, logs);
    
    res.json({
        isWinner,
        locationName: LOCATIONS[locationId].name,
        prize: LOCATIONS[locationId].prize,
        emoji: LOCATIONS[locationId].emoji,
        accessTime,
        winnerTime
    });
});

// 관리자 - 당첨자 조회
app.get('/api/admin/winners', async (req, res) => {
    const winners = await loadData(WINNERS_FILE);
    
    // 장소 정보 포함해서 반환
    const winnersWithLocation = {};
    for (const [locationId, winner] of Object.entries(winners)) {
        winnersWithLocation[locationId] = {
            ...winner,
            locationInfo: LOCATIONS[locationId]
        };
    }
    
    res.json(winnersWithLocation);
});

// 관리자 - 접속 로그 조회
app.get('/api/admin/logs', async (req, res) => {
    const logs = await loadData(LOGS_FILE, []);
    
    // 최근 100개만 반환
    const recentLogs = logs.slice(-100).reverse();
    
    // 장소 정보 포함
    const logsWithLocation = recentLogs.map(log => ({
        ...log,
        locationInfo: LOCATIONS[log.locationId]
    }));
    
    res.json(logsWithLocation);
});

// 관리자 - 이벤트 초기화
app.post('/api/admin/reset', async (req, res) => {
    try {
        await saveData(WINNERS_FILE, {});
        await saveData(LOGS_FILE, []);
        
        console.log('🔄 이벤트가 초기화되었습니다.');
        res.json({ message: '이벤트가 초기화되었습니다.' });
    } catch (error) {
        console.error('초기화 실패:', error);
        res.status(500).json({ error: '초기화에 실패했습니다.' });
    }
});

// 통계 API
app.get('/api/admin/stats', async (req, res) => {
    const winners = await loadData(WINNERS_FILE);
    const logs = await loadData(LOGS_FILE, []);
    
    const stats = {
        totalLocations: Object.keys(LOCATIONS).length,
        winnersCount: Object.keys(winners).length,
        totalParticipants: logs.length,
        participantsByLocation: {}
    };
    
    // 장소별 참여자 수 계산
    for (const locationId of Object.keys(LOCATIONS)) {
        stats.participantsByLocation[locationId] = {
            name: LOCATIONS[locationId].name,
            count: logs.filter(log => log.locationId === locationId).length,
            hasWinner: !!winners[locationId]
        };
    }
    
    res.json(stats);
});

// React 라우팅을 위한 catch-all 핸들러
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// 서버 시작
async function startServer() {
    await ensureDataDir();
    
    app.listen(PORT, () => {
        console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
        console.log(`📱 로컬 URL: http://localhost:${PORT}`);
        console.log('\n📍 QR코드용 링크:');
        Object.keys(LOCATIONS).forEach(locationId => {
            console.log(`${LOCATIONS[locationId].name}: http://localhost:${PORT}/location/${locationId}`);
        });
    });
}

startServer().catch(console.error);

// 우아한 종료
process.on('SIGINT', () => {
    console.log('\n서버를 종료합니다...');
    process.exit(0);
});

module.exports = app;