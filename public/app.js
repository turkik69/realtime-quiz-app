// ==================== إعدادات الاتصال ====================
const socket = io();
let currentPlayer = null;
let gameState = {
    isQuizActive: false,
    currentQuestion: null,
    selectedAnswer: null,
    timeRemaining: 0,
    timerInterval: null
};

// ==================== العناصر DOM ====================
const screens = {
    login: document.getElementById('loginScreen'),
    lobby: document.getElementById('lobbyScreen'),
    question: document.getElementById('questionScreen'),
    results: document.getElementById('resultsScreen'),
    final: document.getElementById('finalScreen')
};

const inputs = {
    playerName: document.getElementById('playerName'),
    joinBtn: document.getElementById('joinBtn'),
    playAgainBtn: document.getElementById('playAgainBtn')
};

// ==================== الدوال المساعدة ====================
function switchScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
    }
}

function playNotificationSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function formatTime(seconds) {
    return seconds.toFixed(2);
}

// ==================== شاشة الدخول ====================
const avatarOptions = document.querySelectorAll('.avatar-option');
let selectedAvatar = '🦸‍♂️';

avatarOptions.forEach(option => {
    option.addEventListener('click', () => {
        avatarOptions.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        selectedAvatar = option.dataset.avatar;
    });
});

// تفعيل زر الدخول عند إدخال الاسم
inputs.playerName.addEventListener('input', () => {
    inputs.joinBtn.disabled = inputs.playerName.value.trim() === '';
});

// تعيين الاختيار الأول افتراضياً
avatarOptions[0].click();

// زر الدخول
inputs.joinBtn.addEventListener('click', () => {
    const playerName = inputs.playerName.value.trim();
    if (playerName) {
        currentPlayer = {
            name: playerName,
            avatar: selectedAvatar
        };
        socket.emit('join', currentPlayer);
    }
});

// ==================== اتصالات Socket.io ====================
socket.on('joinSuccess', (data) => {
    console.log('✅ تم الدخول بنجاح:', data);
    document.getElementById('playerNameDisplay').textContent = `مرحباً ${currentPlayer.name} ${currentPlayer.avatar}`;
    switchScreen('lobby');
    updatePlayersList(data.players);
});

socket.on('playersUpdate', (players) => {
    updatePlayersList(players);
});

socket.on('questionSent', (data) => {
    gameState.isQuizActive = true;
    gameState.currentQuestion = data;
    gameState.selectedAnswer = null;
    gameState.timeRemaining = data.timeLimit / 1000;
    
    displayQuestion(data);
    startTimer();
    switchScreen('question');
});

socket.on('answerSubmitted', (data) => {
    updateLiveStats(data);
});

socket.on('results', (data) => {
    clearInterval(gameState.timerInterval);
    gameState.isQuizActive = false;
    displayResults(data);
    switchScreen('results');
    
    // عداد للسؤال التالي
    let countdown = 4;
    const countdownEl = document.getElementById('nextQuestionCountdown');
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownEl.textContent = countdown;
        if (countdown === 0) clearInterval(countdownInterval);
    }, 1000);
});

socket.on('leaderboardUpdate', (leaderboard) => {
    updateCurrentLeaderboard(leaderboard);
});

socket.on('quizEnded', (finalResults) => {
    clearInterval(gameState.timerInterval);
    gameState.isQuizActive = false;
    displayFinalResults(finalResults);
    switchScreen('final');
});

socket.on('connect_error', (error) => {
    console.error('❌ خطأ في الاتصال:', error);
    alert('خطأ في الاتصال بالخادم. يرجى إعادة المحاولة.');
});

// ==================== تحديث قائمة اللاعبين ====================
function updatePlayersList(players) {
    const playersList = document.getElementById('playersList');
    const playersCount = document.getElementById('playersCount');
    const connectedPlayers = document.getElementById('connectedPlayers');
    
    playersList.innerHTML = '';
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.innerHTML = `
            <div class="avatar">${player.avatar}</div>
            <div class="name">${player.name}</div>
            <div class="online-badge"></div>
        `;
        playersList.appendChild(playerItem);
    });
    
    playersCount.textContent = `${players.length} لاعب متصل`;
    connectedPlayers.textContent = players.length;
    
    // بدء المسابقة تلقائياً عند وجود 2 لاعب على الأقل
    if (players.length >= 2) {
        setTimeout(() => {
            socket.emit('startQuiz');
        }, 3000);
    }
}

// ==================== عرض السؤال ====================
function displayQuestion(data) {
    document.getElementById('questionNumber').textContent = data.questionNumber;
    document.getElementById('totalQuestions').textContent = data.totalQuestions;
    document.getElementById('categoryBadge').textContent = `📚 ${data.category}`;
    document.getElementById('questionText').textContent = data.question;
    document.getElementById('totalPlayersCount').textContent = document.getElementById('connectedPlayers').textContent;
    document.getElementById('answeredCount').textContent = '0';
    
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';
    
    data.options.forEach((option, index) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = option;
        btn.dataset.index = index;
        
        btn.addEventListener('click', () => {
            if (!gameState.isQuizActive || gameState.selectedAnswer !== null) return;
            
            gameState.selectedAnswer = index;
            socket.emit('answer', { answer: index });
            
            // تحديث الواجهة
            document.querySelectorAll('.option-btn').forEach(b => {
                b.disabled = true;
                if (parseInt(b.dataset.index) === index) {
                    b.classList.add('selected');
                }
            });
            
            playNotificationSound();
        });
        
        optionsContainer.appendChild(btn);
    });
}

// ==================== المؤقت ====================
function startTimer() {
    const timerText = document.getElementById('timerText');
    const timerCircle = document.getElementById('timerCircle');
    gameState.timeRemaining = gameState.currentQuestion.timeLimit / 1000;
    const totalTime = gameState.timeRemaining;
    
    clearInterval(gameState.timerInterval);
    
    gameState.timerInterval = setInterval(() => {
        gameState.timeRemaining -= 0.1;
        
        if (gameState.timeRemaining <= 0) {
            gameState.timeRemaining = 0;
            clearInterval(gameState.timerInterval);
        }
        
        timerText.textContent = Math.ceil(gameState.timeRemaining);
        
        // تغيير اللون حسب الوقت المتبقي
        if (gameState.timeRemaining <= 3) {
            timerText.classList.add('critical');
            timerText.classList.remove('warning');
        } else if (gameState.timeRemaining <= 7) {
            timerText.classList.add('warning');
            timerText.classList.remove('critical');
        } else {
            timerText.classList.remove('warning', 'critical');
        }
        
        // تحديث دائرة المؤقت
        const progress = (gameState.timeRemaining / totalTime) * 282.7;
        timerCircle.style.strokeDashoffset = 282.7 - progress;
    }, 100);
}

// ==================== تحديث إحصائيات مباشرة ====================
function updateLiveStats(data) {
    document.getElementById('answeredCount').textContent = data.answeredCount;
}

// ==================== عرض النتائج ====================
function displayResults(data) {
    document.getElementById('correctAnswerDisplay').textContent = data.correctAnswerText;
    
    const roundResults = document.getElementById('roundResults');
    roundResults.innerHTML = '';
    
    if (data.rankings.length === 0) {
        roundResults.innerHTML = '<p style="text-align: center; color: #cbd5e1;">لا توجد إجابات صحيحة في هذا السؤال</p>';
    } else {
        data.rankings.forEach((rank, index) => {
            const rankingItem = document.createElement('div');
            rankingItem.className = `ranking-item ${['gold', 'silver', 'bronze'][index] || ''}`;
            rankingItem.innerHTML = `
                <div class="ranking-medal">${['🥇', '🥈', '🥉'][index]}</div>
                <div class="ranking-info">
                    <div class="ranking-name">
                        <span class="ranking-avatar">${rank.avatar}</span>
                        ${rank.name}
                    </div>
                    <div class="ranking-time">⏱️ ${rank.responseTime}s</div>
                </div>
                <div class="ranking-points">+${rank.points}</div>
            `;
            roundResults.appendChild(rankingItem);
        });
    }
}

// ==================== تحديث الترتيب الحالي ====================
function updateCurrentLeaderboard(leaderboard) {
    const leaderboardEl = document.getElementById('currentLeaderboard');
    leaderboardEl.innerHTML = '';
    
    leaderboard.slice(0, 5).forEach((player, index) => {
        const leaderboardItem = document.createElement('div');
        leaderboardItem.className = 'leaderboard-item';
        leaderboardItem.innerHTML = `
            <div class="leaderboard-rank">#${index + 1}</div>
            <div class="leaderboard-player">
                <span class="leaderboard-player-avatar">${player.avatar}</span>
                <span class="leaderboard-player-name">${player.name}</span>
            </div>
            <div class="leaderboard-score">${player.totalScore}</div>
        `;
        leaderboardEl.appendChild(leaderboardItem);
    });
}

// ==================== عرض النتائج النهائية ====================
function displayFinalResults(finalResults) {
    const finalLeaderboard = document.getElementById('finalLeaderboard');
    finalLeaderboard.innerHTML = '';
    
    finalResults.forEach((player) => {
        const rankItem = document.createElement('div');
        rankItem.className = 'final-rank-item';
        rankItem.innerHTML = `
            <div class="final-medal">${player.medal}</div>
            <div class="final-player-info">
                <div class="final-player-name">
                    <span class="final-player-avatar">${player.avatar}</span>
                    ${player.name}
                </div>
                <div class="final-correct-count">✓ ${player.correctAnswers} إجابات صحيحة</div>
            </div>
            <div class="final-player-score">
                <div class="final-score-value">${player.totalScore}</div>
                <div class="final-score-label">نقطة</div>
            </div>
        `;
        finalLeaderboard.appendChild(rankItem);
    });
    
    // عرض إحصائيات اللاعب الحالي
    const currentPlayerStats = finalResults.find(p => p.name === currentPlayer.name);
    if (currentPlayerStats) {
        const statsHTML = `
            <div class="stat-card">
                <div class="stat-card-value">${currentPlayerStats.rank}</div>
                <div class="stat-card-label">المركز النهائي</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value">${currentPlayerStats.totalScore}</div>
                <div class="stat-card-label">إجمالي النقاط</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value">${currentPlayerStats.correctAnswers}</div>
                <div class="stat-card-label">إجابات صحيحة</div>
            </div>
            <div class="stat-card">
                <div class="stat-card-value">${((currentPlayerStats.correctAnswers / document.getElementById('totalQuestions').textContent) * 100).toFixed(0)}%</div>
                <div class="stat-card-label">نسبة النجاح</div>
            </div>
        `;
        document.getElementById('playerFinalStats').innerHTML = statsHTML;
    }
}

// ==================== زر العب مرة أخرى ====================
inputs.playAgainBtn.addEventListener('click', () => {
    location.reload();
});

// ==================== معالجة قطع الاتصال ====================
socket.on('disconnect', () => {
    console.log('❌ تم قطع الاتصال');
});

// ==================== التهيئة ====================
console.log('🎮 تطبيق المسابقات جاهز!');
