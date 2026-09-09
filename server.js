const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==================== تخزين البيانات ====================
const playersDatabase = {}; // لحفظ بيانات المشاركين
const quizState = {
  currentQuestionIndex: -1,
  isActive: false,
  startTime: null,
  questionTime: 15000, // 15 ثانية
  players: {},
  currentAnswers: {},
  leaderboard: [],
  quiz: []
};

const QUIZ_DATA = [
  {
    id: 1,
    question: "كم عدد قارات العالم؟",
    options: ["5 قارات", "6 قارات", "7 قارات", "8 قارات"],
    correct: 2,
    category: "جغرافيا"
  },
  {
    id: 2,
    question: "من هو أول رئيس للولايات المتحدة الأمريكية؟",
    options: ["جورج واشنطن", "توماس جيفرسون", "جون آدامز", "فرانكلين روزفلت"],
    correct: 0,
    category: "التاريخ"
  },
  {
    id: 3,
    question: "كم عدد سور الصين العظيم؟",
    options: ["واحد فقط", "عدة جدران", "3 جدران", "5 جدران"],
    correct: 1,
    category: "معالم تاريخية"
  },
  {
    id: 4,
    question: "ما هي أكبر دولة في العالم من حيث المساحة؟",
    options: ["كندا", "الصين", "روسيا", "الولايات المتحدة"],
    correct: 2,
    category: "جغرافيا"
  },
  {
    id: 5,
    question: "كم عدد فقرات العمود الفقري للإنسان؟",
    options: ["30 فقرة", "33 فقرة", "36 فقرة", "40 فقرة"],
    correct: 1,
    category: "العلوم"
  },
  {
    id: 6,
    question: "ما هو أعمق محيط في العالم؟",
    options: ["المحيط الأطلسي", "المحيط الهندي", "المحيط المتجمد الشمالي", "المحيط الهادئ"],
    correct: 3,
    category: "جغرافيا"
  },
  {
    id: 7,
    question: "كم عدد دول الاتحاد الأوروبي؟",
    options: ["25 دولة", "27 دولة", "30 دولة", "35 دولة"],
    correct: 1,
    category: "السياسة"
  },
  {
    id: 8,
    question: "من كتب رواية 'الحرب والسلام'؟",
    options: ["تولستوي", "دوستويفسكي", "تشيخوف", "بوشكين"],
    correct: 0,
    category: "الأدب"
  },
  {
    id: 9,
    question: "في أي سنة سقطت جدار برلين؟",
    options: ["1987", "1988", "1989", "1990"],
    correct: 2,
    category: "التاريخ"
  },
  {
    id: 10,
    question: "ما هو أكبر حيوان في العالم؟",
    options: ["الفيل", "الحوت الأزرق", "الزرافة", "فرس النهر"],
    correct: 1,
    category: "الحيوانات"
  }
];

quizState.quiz = QUIZ_DATA;

// ==================== دوال مساعدة ====================
function calculatePoints(rank) {
  const pointsTable = { 0: 100, 1: 80, 2: 60 };
  return pointsTable[rank] !== undefined ? pointsTable[rank] : 20;
}

function updateLeaderboard() {
  quizState.leaderboard = Object.values(quizState.players).sort((a, b) => b.totalScore - a.totalScore);
}

function resetRound() {
  quizState.currentAnswers = {};
  Object.keys(quizState.players).forEach(playerId => {
    quizState.players[playerId].currentAnswer = null;
    quizState.players[playerId].answered = false;
    quizState.players[playerId].answerTime = null;
  });
}

// حفظ بيانات المشارك في قاعدة البيانات
function savePlayerData(playerName, playerData) {
  if (!playersDatabase[playerName]) {
    playersDatabase[playerName] = {
      name: playerName,
      avatar: playerData.avatar,
      totalGamesPlayed: 0,
      totalScore: 0,
      highestScore: 0,
      correctAnswersTotal: 0,
      lastPlayedDate: new Date().toISOString(),
      gamesHistory: []
    };
  }
  playersDatabase[playerName].lastPlayedDate = new Date().toISOString();
}

// ==================== Socket Events ====================
io.on('connection', (socket) => {
  console.log(`✅ لاعب جديد متصل: ${socket.id}`);

  socket.on('join', (playerData) => {
    const playerId = socket.id;
    
    // حفظ بيانات المشارك
    savePlayerData(playerData.name, playerData);
    
    quizState.players[playerId] = {
      id: playerId,
      name: playerData.name,
      avatar: playerData.avatar,
      totalScore: 0,
      roundScore: 0,
      currentAnswer: null,
      answered: false,
      answerTime: null,
      correctAnswers: 0
    };

    socket.emit('joinSuccess', {
      playerId,
      players: Object.values(quizState.players),
      leaderboard: quizState.leaderboard,
      playerStats: playersDatabase[playerData.name] || {}
    });

    io.emit('playersUpdate', Object.values(quizState.players));
    console.log(`👥 عدد اللاعبين: ${Object.keys(quizState.players).length}`);
  });

  socket.on('startQuiz', () => {
    if (!quizState.isActive) {
      quizState.isActive = true;
      quizState.currentQuestionIndex = 0;
      resetRound();
      sendQuestion();
    }
  });

  socket.on('answer', (data) => {
    const playerId = socket.id;
    if (quizState.players[playerId] && !quizState.players[playerId].answered) {
      const answerTime = Date.now() - quizState.startTime;
      quizState.players[playerId].currentAnswer = data.answer;
      quizState.players[playerId].answered = true;
      quizState.players[playerId].answerTime = answerTime;
      quizState.currentAnswers[playerId] = { answer: data.answer, time: answerTime };

      io.emit('answerSubmitted', {
        playerId,
        playerName: quizState.players[playerId].name,
        answeredCount: Object.keys(quizState.currentAnswers).length,
        totalPlayers: Object.keys(quizState.players).length
      });
    }
  });

  socket.on('disconnect', () => {
    const playerName = quizState.players[socket.id]?.name;
    if (playerName && playersDatabase[playerName]) {
      playersDatabase[playerName].lastPlayedDate = new Date().toISOString();
    }
    delete quizState.players[socket.id];
    io.emit('playersUpdate', Object.values(quizState.players));
    console.log(`❌ لاعب غادر: ${socket.id}`);
  });
});

// ==================== منطق اللعبة ====================
function sendQuestion() {
  if (quizState.currentQuestionIndex >= quizState.quiz.length) {
    endQuiz();
    return;
  }

  const currentQuestion = quizState.quiz[quizState.currentQuestionIndex];
  quizState.startTime = Date.now();
  resetRound();

  io.emit('questionSent', {
    questionNumber: quizState.currentQuestionIndex + 1,
    totalQuestions: quizState.quiz.length,
    question: currentQuestion.question,
    options: currentQuestion.options,
    category: currentQuestion.category,
    timeLimit: quizState.questionTime
  });

  setTimeout(processAnswers, quizState.questionTime);
}

function processAnswers() {
  const currentQuestion = quizState.quiz[quizState.currentQuestionIndex];
  const correctAnswer = currentQuestion.correct;
  
  // ترتيب الإجابات الصحيحة حسب السرعة
  const correctAnswers = Object.keys(quizState.currentAnswers)
    .filter(playerId => quizState.currentAnswers[playerId].answer === correctAnswer)
    .sort((a, b) => quizState.currentAnswers[a].time - quizState.currentAnswers[b].time);

  // حساب النقاط
  correctAnswers.forEach((playerId, rank) => {
    const points = calculatePoints(rank);
    quizState.players[playerId].totalScore += points;
    quizState.players[playerId].correctAnswers++;
  });

  updateLeaderboard();

  // بيانات النتائج
  const results = {
    correctAnswerIndex: correctAnswer,
    correctAnswerText: currentQuestion.options[correctAnswer],
    rankings: correctAnswers.map((playerId, rank) => ({
      rank: rank + 1,
      name: quizState.players[playerId].name,
      avatar: quizState.players[playerId].avatar,
      points: calculatePoints(rank),
      responseTime: (quizState.currentAnswers[playerId].time / 1000).toFixed(2)
    }))
  };

  io.emit('results', results);
  io.emit('leaderboardUpdate', quizState.leaderboard);

  // الانتقال للسؤال التالي
  quizState.currentQuestionIndex++;
  setTimeout(() => {
    if (quizState.currentQuestionIndex < quizState.quiz.length) {
      sendQuestion();
    } else {
      endQuiz();
    }
  }, 4000);
}

function endQuiz() {
  quizState.isActive = false;
  updateLeaderboard();

  const finalResults = quizState.leaderboard.map((player, index) => ({
    rank: index + 1,
    name: player.name,
    avatar: player.avatar,
    totalScore: player.totalScore,
    correctAnswers: player.correctAnswers,
    medal: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''
  }));

  // حفظ نتائج اللعبة في قاعدة البيانات
  finalResults.forEach(result => {
    if (playersDatabase[result.name]) {
      playersDatabase[result.name].totalGamesPlayed++;
      playersDatabase[result.name].totalScore += result.totalScore;
      playersDatabase[result.name].correctAnswersTotal += result.correctAnswers;
      
      if (result.totalScore > playersDatabase[result.name].highestScore) {
        playersDatabase[result.name].highestScore = result.totalScore;
      }
      
      playersDatabase[result.name].gamesHistory.push({
        date: new Date().toISOString(),
        score: result.totalScore,
        correctAnswers: result.correctAnswers,
        rank: result.rank
      });
    }
  });

  io.emit('quizEnded', finalResults);
  console.log('🏁 انتهت المسابقة!');
}

// ==================== الروابط الإضافية ====================
// الحصول على إحصائيات المشارك
app.get('/api/player-stats/:playerName', (req, res) => {
  const playerName = req.params.playerName;
  const stats = playersDatabase[playerName];
  
  if (stats) {
    res.json(stats);
  } else {
    res.status(404).json({ error: 'اللاعب غير موجود' });
  }
});

// الحصول على جميع المشاركين
app.get('/api/all-players', (req, res) => {
  const allPlayers = Object.values(playersDatabase).sort((a, b) => b.totalScore - a.totalScore);
  res.json(allPlayers);
});

// ==================== التشغيل ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 ═══════════════════════════════════════`);
  console.log(`   تطبيق المسابقات الحية يعمل على:`);
  console.log(`   🌐 http://localhost:${PORT}`);
  console.log(`🎮 ═══════════════════════════════════════\n`);
});
