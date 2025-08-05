import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, Link } from 'react-router-dom';
import './App.css';

// API 기본 URL (환경에 따라 자동 설정)
const API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';

// API 호출 함수들
const api = {
  getLocations: () => fetch(`${API_BASE_URL}/api/locations`).then(res => res.json()),
  getLocation: (id) => fetch(`${API_BASE_URL}/api/locations/${id}`).then(res => res.json()),
  participate: (data) => fetch(`${API_BASE_URL}/api/participate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(res => res.json()),
  getWinners: () => fetch(`${API_BASE_URL}/api/admin/winners`).then(res => res.json()),
  getLogs: () => fetch(`${API_BASE_URL}/api/admin/logs`).then(res => res.json()),
  getStats: () => fetch(`${API_BASE_URL}/api/admin/stats`).then(res => res.json()),
  resetEvent: () => fetch(`${API_BASE_URL}/api/admin/reset`, { method: 'POST' }).then(res => res.json())
};

// 홈페이지 컴포넌트
function HomePage() {
  const [locations, setLocations] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLocations()
      .then(setLocations)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">로딩 중...</div>;
  }

  return (
    <div className="home-container">
      <header className="hero-section">
        <h1>🎁 장소별 선착순 이벤트</h1>
        <p>QR코드를 스캔하고 선착순 상품을 받아보세요!</p>
      </header>

      <section className="locations-section">
        <h2>📍 이벤트 장소</h2>
        <div className="locations-grid">
          {Object.entries(locations).map(([id, location]) => (
            <Link key={id} to={`/location/${id}`} className="location-card">
              <div className="location-emoji">{location.emoji}</div>
              <h3>{location.name}</h3>
              <p className="prize">🏆 {location.prize}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h2>🔧 관리자 메뉴</h2>
        <div className="admin-buttons">
          <Link to="/admin" className="admin-btn">관리자 페이지</Link>
        </div>
      </section>
    </div>
  );
}

// 장소별 이벤트 페이지
function LocationPage() {
  const { locationId } = useParams();
  const [location, setLocation] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [participating, setParticipating] = useState(false);

  useEffect(() => {
    // 페이지 로드시 장소 정보 가져오기
    api.getLocation(locationId)
      .then(setLocation)
      .catch(() => setResult({ error: '존재하지 않는 장소입니다.' }))
      .finally(() => setLoading(false));
  }, [locationId]);

  useEffect(() => {
    // 장소 정보가 로드되면 자동으로 참여
    if (location && !participating && !result) {
      participate();
    }
  }, [location]);

  const participate = async () => {
    if (participating) return;
    
    setParticipating(true);
    
    try {
      const participationData = {
        locationId,
        accessTime: new Date().toISOString(),
        userAgent: navigator.userAgent
      };
      
      const response = await api.participate(participationData);
      setResult(response);
    } catch (error) {
      setResult({ error: '참여 중 오류가 발생했습니다.' });
    } finally {
      setParticipating(false);
    }
  };

  if (loading) {
    return (
      <div className="location-container">
        <div className="status-card loading">
          <div className="spinner"></div>
          <p>장소 정보 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="location-container">
        <div className="status-card error">
          <h2>❌ 오류</h2>
          <p>존재하지 않는 장소입니다.</p>
          <Link to="/" className="btn">홈으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="location-container">
      <div className="location-header">
        <div className="location-emoji-large">{location.emoji}</div>
        <h1>{location.name}</h1>
        <div className="prize-info">
          <h2>🏆 상품</h2>
          <p>{location.prize}</p>
        </div>
      </div>

      {participating && (
        <div className="status-card loading">
          <div className="spinner"></div>
          <p>선착순 확인 중...</p>
        </div>
      )}

      {result && (
        <div className={`status-card ${result.isWinner ? 'winner' : 'loser'}`}>
          {result.error ? (
            <>
              <h2>❌ 오류</h2>
              <p>{result.error}</p>
            </>
          ) : result.isWinner ? (
            <>
              <h2>🎉 축하합니다!</h2>
              <p>선착순 당첨되셨습니다!</p>
              <div className="prize-won">
                <p>{result.emoji} {result.prize}</p>
              </div>
              <p className="time-info">
                당첨 시간: {new Date(result.accessTime).toLocaleString('ko-KR')}
              </p>
            </>
          ) : (
            <>
              <h2>😢 아쉽습니다</h2>
              <p>이미 다른 분이 당첨되셨습니다</p>
              {result.winnerTime && (
                <p className="time-info">
                  당첨자 결정 시간: {new Date(result.winnerTime).toLocaleString('ko-KR')}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className="footer-info">
        <p>이벤트 참여해주셔서 감사합니다!</p>
        <Link to="/" className="btn">다른 장소 보기</Link>
      </div>
    </div>
  );
}

// 관리자 페이지
function AdminPage() {
  const [activeTab, setActiveTab] = useState('stats');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = async (type) => {
    setLoading(true);
    try {
      let result;
      switch(type) {
        case 'stats':
          result = await api.getStats();
          break;
        case 'winners':
          result = await api.getWinners();
          break;
        case 'logs':
          result = await api.getLogs();
          break;
        default:
          result = null;
      }
      setData(result);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const handleReset = async () => {
    if (window.confirm('정말로 이벤트를 초기화하시겠습니까? 모든 당첨자 정보가 삭제됩니다.')) {
      try {
        await api.resetEvent();
        alert('이벤트가 초기화되었습니다.');
        loadData(activeTab);
      } catch (error) {
        alert('초기화에 실패했습니다.');
      }
    }
  };

  return (
    <div className="admin-container">
      <header className="admin-header">
        <h1>🔧 관리자 페이지</h1>
        <Link to="/" className="btn">홈으로</Link>
      </header>

      <nav className="admin-nav">
        <button 
          className={activeTab === 'stats' ? 'active' : ''} 
          onClick={() => setActiveTab('stats')}
        >
          📊 통계
        </button>
        <button 
          className={activeTab === 'winners' ? 'active' : ''} 
          onClick={() => setActiveTab('winners')}
        >
          🏆 당첨자
        </button>
        <button 
          className={activeTab === 'logs' ? 'active' : ''} 
          onClick={() => setActiveTab('logs')}
        >
          📋 로그
        </button>
        <button className="reset-btn" onClick={handleReset}>
          🔄 초기화
        </button>
      </nav>

      <div className="admin-content">
        {loading ? (
          <div className="loading">데이터 로딩 중...</div>
        ) : (
          <AdminContent activeTab={activeTab} data={data} />
        )}
      </div>
    </div>
  );
}

// 관리자 콘텐츠 컴포넌트
function AdminContent({ activeTab, data }) {
  if (!data) return <div>데이터가 없습니다.</div>;

  switch(activeTab) {
    case 'stats':
      return (
        <div className="stats-content">
          <div className="stats-grid">
            <div className="stat-card">
              <h3>전체 장소</h3>
              <p className="stat-number">{data.totalLocations}</p>
            </div>
            <div className="stat-card">
              <h3>당첨자 수</h3>
              <p className="stat-number">{data.winnersCount}</p>
            </div>
            <div className="stat-card">
              <h3>총 참여자</h3>
              <p className="stat-number">{data.totalParticipants}</p>
            </div>
          </div>
          
          <h3>장소별 현황</h3>
          <div className="location-stats">
            {Object.entries(data.participantsByLocation).map(([id, info]) => (
              <div key={id} className={`location-stat ${info.hasWinner ? 'has-winner' : 'no-winner'}`}>
                <h4>{info.name}</h4>
                <p>참여자: {info.count}명</p>
                <p>{info.hasWinner ? '✅ 당첨자 있음' : '⏳ 당첨자 없음'}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case 'winners':
      return (
        <div className="winners-content">
          {Object.keys(data).length === 0 ? (
            <p>아직 당첨자가 없습니다.</p>
          ) : (
            Object.entries(data).map(([locationId, winner]) => (
              <div key={locationId} className="winner-card">
                <h3>{winner.locationInfo.emoji} {winner.locationInfo.name}</h3>
                <p><strong>상품:</strong> {winner.locationInfo.prize}</p>
                <p><strong>당첨자 IP:</strong> {winner.ip}</p>
                <p><strong>당첨 시간:</strong> {new Date(winner.accessTime).toLocaleString('ko-KR')}</p>
              </div>
            ))
          )}
        </div>
      );

    case 'logs':
      return (
        <div className="logs-content">
          {data.length === 0 ? (
            <p>접속 기록이 없습니다.</p>
          ) : (
            data.map(log => (
              <div key={log.id} className={`log-card ${log.isWinner ? 'winner-log' : 'normal-log'}`}>
                <h4>{log.locationInfo ? log.locationInfo.name : '알 수 없는 장소'}</h4>
                <p><strong>IP:</strong> {log.ip}</p>
                <p><strong>시간:</strong> {new Date(log.accessTime).toLocaleString('ko-KR')}</p>
                <p className="result">{log.isWinner ? '🎉 당첨!' : '😢 실패'}</p>
              </div>
            ))
          )}
        </div>
      );

    default:
      return <div>알 수 없는 탭입니다.</div>;
  }
}

// 메인 앱 컴포넌트
function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/location/:locationId" element={<LocationPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;