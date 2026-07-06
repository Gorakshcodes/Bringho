import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  updateDoc
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged
} from 'firebase/auth';
import {
  Copy,
  Plus,
  Play,
  RefreshCw,
  LogOut,
  Check,
  Flame,
  Sparkles,
  UserPlus,
  Trophy,
  Globe,
  HelpCircle,
  Lock,
  Unlock,
  KeyRound,
  ChevronDown,
  Users
} from 'lucide-react';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'bingo-multiplayer-app';

// When no real Firebase credentials are supplied, run a fully local "demo mode"
// so the UI is playable (solo) without a backend. Enables previews & quick trials.
// Firebase init is skipped entirely — getAuth() would otherwise throw on an
// invalid/empty api key and crash the whole app before it can render.
const isDemo = !firebaseConfig || !firebaseConfig.apiKey;
const app = isDemo ? null : initializeApp(firebaseConfig);
const auth = isDemo ? null : getAuth(app);
const db = isDemo ? null : getFirestore(app);

export default function App() {
  // Auth and Room State
  const [user, setUser] = useState(null);
  const [roomNameInput, setRoomNameInput] = useState(''); // Room name — used for both create and join
  const [isPrivate, setIsPrivate] = useState(false); // Whether the created room is hidden from the lobby
  const [roomId, setRoomId] = useState(''); // Document ID
  const [currentRoom, setCurrentRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isRoomMaster, setIsRoomMaster] = useState(false);

  // Available Public Rooms list + dropdown control
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);
  const nameInputRef = useRef(null);
  const roomsMenuRef = useRef(null);

  // Local Player Board & Setup
  const [board, setBoard] = useState(Array(25).fill(null));
  const [selectedSetupNumber, setSelectedSetupNumber] = useState(1);
  const [isReady, setIsReady] = useState(false);

  // Game UI/Helper States
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Helper to format room names to clean document IDs
  const formatRoomId = (name) => {
    return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
  };

  // Close the public-rooms dropdown when clicking outside of it.
  useEffect(() => {
    if (!isRoomsOpen) return;
    const handleClickOutside = (e) => {
      if (roomsMenuRef.current && !roomsMenuRef.current.contains(e.target)) {
        setIsRoomsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoomsOpen]);

  // Local helper for demo mode: patch the in-memory room immutably.
  const patchDemoRoom = (updater) => {
    setCurrentRoom((prev) => (prev ? updater(JSON.parse(JSON.stringify(prev))) : prev));
  };

  // 1. Authenticate user on mount
  useEffect(() => {
    if (isDemo) {
      // Skip real auth; spin up a throwaway local player.
      const demoUid = 'demo-' + Math.random().toString(36).slice(2, 8);
      setUser({ uid: demoUid, isAnonymous: true });
      setPlayerName(localStorage.getItem('bingo_player_name') || 'Guest');
      setLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        let currentUser = auth.currentUser;
        if (!currentUser) {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        }
      } catch (err) {
        console.error("Auth error:", err);
        setErrorMessage("Failed to connect securely to server. Please refresh.");
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      if (usr) {
        setUser(usr);
        const savedName = localStorage.getItem('bingo_player_name') || '';
        setPlayerName(savedName);
        setLoading(false);
      }
    });

    initAuth();
    return () => unsubscribe();
  }, []);

  // 2. Fetch and Sync Active Rooms List (fetch & filter in-memory).
  //    Private rooms are intentionally excluded from the public lobby.
  useEffect(() => {
    if (!user) return;

    if (isDemo) {
      // Seed a lively-looking lobby so the browser has something to show.
      setAvailableRooms([
        { id: 'friday-fun-night', name: 'Friday Fun Night', playerCount: 3, createdBy: 'demo-a' },
        { id: 'office-league', name: 'Office League', playerCount: 5, createdBy: 'demo-b' },
        { id: 'family-bingo', name: 'Family Bingo', playerCount: 2, createdBy: 'demo-c' }
      ]);
      return;
    }

    const roomsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'rooms');

    const unsubscribe = onSnapshot(roomsCollectionRef, (snapshot) => {
      const roomsList = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Only list rooms that are in the 'setup' phase AND are not private.
        if (data.status === 'setup' && !data.isPrivate) {
          roomsList.push({
            id: docSnap.id,
            name: data.roomName || docSnap.id,
            playerCount: data.players ? Object.keys(data.players).length : 0,
            createdBy: data.createdBy
          });
        }
      });
      // Newest / fullest rooms feel livelier at the top.
      roomsList.sort((a, b) => b.playerCount - a.playerCount);
      setAvailableRooms(roomsList);
    }, (err) => {
      console.error("Error loading rooms list:", err);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Real-time Game State Sync
  useEffect(() => {
    if (!user || !roomId || !isJoined) return;
    if (isDemo) return; // Demo rooms live purely in local state.

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCurrentRoom(data);
        setIsRoomMaster(data.createdBy === user.uid);
      } else {
        setErrorMessage("This room is no longer active.");
        setIsJoined(false);
        setCurrentRoom(null);
      }
    }, (err) => {
      console.error("Error syncing room:", err);
      setErrorMessage("Lost sync with game room.");
    });

    return () => unsubscribe();
  }, [user, roomId, isJoined]);

  // --- ACTIONS ---

  // Create a Custom Named Room (public or private)
  const createRoom = async () => {
    if (!playerName.trim()) {
      setErrorMessage("Please enter a player name first!");
      nameInputRef.current?.focus();
      return;
    }
    if (!roomNameInput.trim()) {
      setErrorMessage("Please enter a custom name for your game room!");
      return;
    }
    if (!user) {
      setErrorMessage("Connecting to server... Please wait a moment.");
      return;
    }
    setErrorMessage('');

    const cleanRoomName = roomNameInput.trim();
    const generatedRoomId = formatRoomId(cleanRoomName);

    if (!generatedRoomId) {
      setErrorMessage("Room name contains invalid characters. Try letters and numbers.");
      return;
    }

    localStorage.setItem('bingo_player_name', playerName.trim());

    const buildRoomData = () => ({
      id: generatedRoomId,
      roomName: cleanRoomName,
      isPrivate: isPrivate,
      status: 'setup',
      createdBy: user.uid,
      players: {
        [user.uid]: {
          uid: user.uid,
          name: playerName.trim(),
          isReady: false,
          bingoLinesCount: 0,
          joinedAt: Date.now()
        }
      },
      calledNumbers: [],
      turnOrder: [user.uid],
      currentTurnIndex: 0,
      winners: [],
      createdAt: Date.now()
    });

    if (isDemo) {
      // Solo local room — no persistence, but the full flow is playable.
      const demoRoom = buildRoomData();
      setCurrentRoom(demoRoom);
      setRoomId(generatedRoomId);
      setIsJoined(true);
      setIsRoomMaster(true);
      setSuccessMessage(`Demo room "${cleanRoomName}" created! (offline mode)`);
      setTimeout(() => setSuccessMessage(''), 4000);
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', generatedRoomId);
      const roomSnap = await getDoc(roomRef);

      // Prevent overwriting active rooms
      if (roomSnap.exists() && roomSnap.data().status !== 'ended') {
        setErrorMessage("A room with that name is already active. Please pick a unique name!");
        return;
      }

      await setDoc(roomRef, buildRoomData());
      setRoomId(generatedRoomId);
      setIsJoined(true);
      setIsRoomMaster(true);
      setSuccessMessage(
        isPrivate
          ? `Private room "${cleanRoomName}" created! Share the code so friends can join.`
          : `Room "${cleanRoomName}" created!`
      );
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error("Error creating room:", err);
      setErrorMessage("Failed to create the room. Try another name.");
    }
  };

  // Join Game Room. Accepts either a document id (from the lobby list)
  // or a human-typed room name / code (for private rooms).
  const joinRoom = async (targetRoom) => {
    const cleanRoomId = formatRoomId(String(targetRoom || ''));
    if (!cleanRoomId) {
      setErrorMessage("Please enter a valid room code to join.");
      return;
    }
    if (!playerName.trim()) {
      setErrorMessage("Please enter your player name first at the top of the form!");
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!user) {
      setErrorMessage("Connecting... Please try again in a second.");
      return;
    }
    setErrorMessage('');
    localStorage.setItem('bingo_player_name', playerName.trim());

    if (isDemo) {
      const label = availableRooms.find((r) => r.id === cleanRoomId)?.name || cleanRoomId;
      setCurrentRoom({
        id: cleanRoomId,
        roomName: label,
        isPrivate: false,
        status: 'setup',
        createdBy: user.uid, // you host the demo room so you can start it solo
        players: {
          [user.uid]: {
            uid: user.uid,
            name: playerName.trim(),
            isReady: false,
            bingoLinesCount: 0,
            joinedAt: Date.now()
          }
        },
        calledNumbers: [],
        turnOrder: [user.uid],
        currentTurnIndex: 0,
        winners: [],
        createdAt: Date.now()
      });
      setRoomId(cleanRoomId);
      setIsJoined(true);
      setIsRoomMaster(true);
      setRoomNameInput('');
      setSuccessMessage(`Joined ${label}! (offline demo — solo play)`);
      setTimeout(() => setSuccessMessage(''), 3000);
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', cleanRoomId);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        setErrorMessage(`No room found with that code. Double-check the spelling.`);
        return;
      }

      const roomData = roomSnap.data();
      if (roomData.status !== 'setup') {
        setErrorMessage("This game is already in progress.");
        return;
      }

      const updatedPlayers = {
        ...roomData.players,
        [user.uid]: {
          uid: user.uid,
          name: playerName.trim(),
          isReady: false,
          bingoLinesCount: 0,
          joinedAt: Date.now()
        }
      };

      const updatedTurnOrder = [...roomData.turnOrder];
      if (!updatedTurnOrder.includes(user.uid)) {
        updatedTurnOrder.push(user.uid);
      }

      await updateDoc(roomRef, {
        players: updatedPlayers,
        turnOrder: updatedTurnOrder
      });

      setRoomId(cleanRoomId);
      setIsJoined(true);
      setRoomNameInput('');
      setSuccessMessage(`Successfully joined ${roomData.roomName || cleanRoomId}!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error("Error joining room:", err);
      setErrorMessage("Could not connect to that room.");
    }
  };

  // Leave current Room
  const leaveRoom = async () => {
    if (!currentRoom || !user) return;
    if (isDemo) {
      setIsJoined(false);
      setCurrentRoom(null);
      setIsReady(false);
      setBoard(Array(25).fill(null));
      setSelectedSetupNumber(1);
      return;
    }
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      const updatedPlayers = { ...currentRoom.players };
      delete updatedPlayers[user.uid];

      const updatedTurnOrder = currentRoom.turnOrder.filter(uid => uid !== user.uid);
      let newCreatedBy = currentRoom.createdBy;

      if (currentRoom.createdBy === user.uid && updatedTurnOrder.length > 0) {
        newCreatedBy = updatedTurnOrder[0];
      }

      await updateDoc(roomRef, {
        players: updatedPlayers,
        turnOrder: updatedTurnOrder,
        createdBy: newCreatedBy
      });
    } catch (err) {
      console.error("Error leaving room:", err);
    }
    setIsJoined(false);
    setCurrentRoom(null);
    setIsReady(false);
    setBoard(Array(25).fill(null));
    setSelectedSetupNumber(1);
  };

  // --- BOARD SETUP ACTIONS ---

  const handleCellSetupClick = (index) => {
    if (isReady) return;

    if (board[index] !== null) {
      const val = board[index];
      const newBoard = [...board];
      newBoard[index] = null;
      setBoard(newBoard);
      if (val < selectedSetupNumber) {
        setSelectedSetupNumber(val);
      }
      return;
    }

    if (selectedSetupNumber > 25) return;
    const newBoard = [...board];
    newBoard[index] = selectedSetupNumber;
    setBoard(newBoard);

    let nextNum = selectedSetupNumber + 1;
    while (nextNum <= 25 && newBoard.includes(nextNum)) {
      nextNum++;
    }
    setSelectedSetupNumber(nextNum);
  };

  const randomizeBoard = () => {
    if (isReady) return;
    const shuffled = Array.from({ length: 25 }, (_, i) => i + 1)
      .sort(() => Math.random() - 0.5);
    setBoard(shuffled);
    setSelectedSetupNumber(26);
  };

  const clearBoard = () => {
    if (isReady) return;
    setBoard(Array(25).fill(null));
    setSelectedSetupNumber(1);
  };

  // --- GAMEPLAY CALCULATION ENGINE ---

  const calculateCompletedLines = (currentBoard, calledNumbers) => {
    if (!calledNumbers) return 0;
    let completedLines = 0;

    // Direct index groups for rows, columns, and diagonals.
    const checks = [
      // Rows
      [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
      // Columns
      [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
      // Diagonals
      [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
    ];

    checks.forEach(indices => {
      const match = indices.every(idx => {
        const val = currentBoard[idx];
        return val !== null && calledNumbers.includes(val);
      });
      if (match) completedLines++;
    });

    return completedLines;
  };

  const toggleReady = async () => {
    if (!user) return;
    if (board.includes(null)) {
      setErrorMessage("Please fill all 25 grid slots first!");
      return;
    }
    setErrorMessage('');

    const newReadyState = !isReady;
    setIsReady(newReadyState);

    if (isDemo) {
      patchDemoRoom((r) => {
        r.players[user.uid].isReady = newReadyState;
        return r;
      });
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await updateDoc(roomRef, {
        [`players.${user.uid}.isReady`]: newReadyState
      });
    } catch (err) {
      console.error("Error readying:", err);
      setIsReady(!newReadyState);
      setErrorMessage("Failed to send ready status.");
    }
  };

  const startGame = async () => {
    if (!currentRoom || !user) return;

    const playersList = Object.values(currentRoom.players);
    const unreadyPlayers = playersList.filter(p => !p.isReady);

    if (unreadyPlayers.length > 0) {
      setErrorMessage(`Cannot start. Waiting for: ${unreadyPlayers.map(p => p.name).join(', ')}`);
      return;
    }

    setErrorMessage('');

    if (isDemo) {
      patchDemoRoom((r) => {
        r.status = 'playing';
        r.currentTurnIndex = 0;
        r.calledNumbers = [];
        r.winners = [];
        return r;
      });
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await updateDoc(roomRef, {
        status: 'playing',
        currentTurnIndex: 0,
        calledNumbers: [],
        winners: []
      });
    } catch (err) {
      console.error("Error starting game:", err);
      setErrorMessage("Could not start game.");
    }
  };

  const callNumber = async (num) => {
    if (!currentRoom || currentRoom.status !== 'playing' || !user) return;

    const turnOwnerUid = currentRoom.turnOrder[currentRoom.currentTurnIndex];
    if (turnOwnerUid !== user.uid) {
      setErrorMessage("It's not your turn!");
      return;
    }

    if (currentRoom.calledNumbers.includes(num)) {
      setErrorMessage("Number already called!");
      return;
    }

    setErrorMessage('');
    const newCalledNumbers = [...currentRoom.calledNumbers, num];
    const localLines = calculateCompletedLines(board, newCalledNumbers);
    let nextTurnIndex = (currentRoom.currentTurnIndex + 1) % currentRoom.turnOrder.length;

    if (isDemo) {
      patchDemoRoom((r) => {
        r.calledNumbers = newCalledNumbers;
        r.currentTurnIndex = nextTurnIndex;
        r.players[user.uid].bingoLinesCount = localLines;
        return r;
      });
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await updateDoc(roomRef, {
        calledNumbers: newCalledNumbers,
        currentTurnIndex: nextTurnIndex,
        [`players.${user.uid}.bingoLinesCount`]: localLines
      });
    } catch (err) {
      console.error("Error calling number:", err);
      setErrorMessage("Error recording play. Try again.");
    }
  };

  useEffect(() => {
    if (!currentRoom || currentRoom.status !== 'playing' || !isJoined || !user) return;

    const localLines = calculateCompletedLines(board, currentRoom.calledNumbers);
    const serverPlayerState = currentRoom.players[user.uid];

    if (!isDemo && serverPlayerState && serverPlayerState.bingoLinesCount !== localLines) {
      const updateLinesOnServer = async () => {
        try {
          const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
          await updateDoc(roomRef, {
            [`players.${user.uid}.bingoLinesCount`]: localLines
          });
        } catch (err) {
          console.warn("Failed to sync lines:", err);
        }
      };
      updateLinesOnServer();
    }

    const activePlayers = Object.values(currentRoom.players);
    const winnersList = activePlayers
      .filter(p => p.bingoLinesCount >= 5)
      .map(p => p.name);

    if (winnersList.length > 0 && currentRoom.status === 'playing') {
      if (isDemo) {
        patchDemoRoom((r) => {
          r.status = 'ended';
          r.winners = winnersList;
          return r;
        });
        return;
      }
      const declareWinner = async () => {
        try {
          const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
          await updateDoc(roomRef, {
            status: 'ended',
            winners: winnersList
          });
        } catch (err) {
          console.warn("Error declaring winner:", err);
        }
      };
      declareWinner();
    }
  }, [currentRoom?.calledNumbers, board, currentRoom?.status, user, roomId, isJoined]);

  const restartGame = async () => {
    if (!currentRoom || !user) return;

    if (isDemo) {
      patchDemoRoom((r) => {
        Object.keys(r.players).forEach((pId) => {
          r.players[pId].isReady = false;
          r.players[pId].bingoLinesCount = 0;
        });
        r.status = 'setup';
        r.calledNumbers = [];
        r.currentTurnIndex = 0;
        r.winners = [];
        return r;
      });
      setIsReady(false);
      setBoard(Array(25).fill(null));
      setSelectedSetupNumber(1);
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      const updatedPlayers = {};
      Object.keys(currentRoom.players).forEach((pId) => {
        updatedPlayers[pId] = {
          ...currentRoom.players[pId],
          isReady: false,
          bingoLinesCount: 0
        };
      });

      await updateDoc(roomRef, {
        status: 'setup',
        calledNumbers: [],
        currentTurnIndex: 0,
        winners: [],
        players: updatedPlayers
      });

      setIsReady(false);
      setBoard(Array(25).fill(null));
      setSelectedSetupNumber(1);
    } catch (err) {
      console.error("Error restarting:", err);
    }
  };

  const copyRoomId = () => {
    const rawVal = currentRoom?.roomName || roomId;
    navigator.clipboard?.writeText(rawVal).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {
      const el = document.createElement('textarea');
      el.value = rawVal;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  const getPlayersList = () => {
    if (!currentRoom) return [];
    return Object.values(currentRoom.players).sort((a, b) => b.bingoLinesCount - a.bingoLinesCount);
  };

  const getActiveTurnUser = () => {
    if (!currentRoom || currentRoom.status !== 'playing') return null;
    const uid = currentRoom.turnOrder[currentRoom.currentTurnIndex];
    return currentRoom.players[uid] || null;
  };

  // Local keyframes so the animation utility classes actually do something
  // even on a CDN Tailwind build that doesn't define them.
  const localStyles = `
    @keyframes bingoFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes bingoSpinSlow { to { transform: rotate(360deg); } }
    @keyframes bingoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes bingoGlow { 0%,100% { box-shadow: 0 0 22px -6px rgba(16,185,129,.55); } 50% { box-shadow: 0 0 34px -4px rgba(45,212,191,.85); } }
    .animate-fade-in { animation: bingoFadeIn .35s ease-out; }
    .animate-spin-slow { animation: bingoSpinSlow 6s linear infinite; }
    .animate-float { animation: bingoFloat 4s ease-in-out infinite; }
    .animate-glow { animation: bingoGlow 2.4s ease-in-out infinite; }
    .bingo-scroll::-webkit-scrollbar { width: 6px; }
    .bingo-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
    .bingo-grid-bg {
      background-image:
        radial-gradient(circle at 15% 15%, rgba(16,185,129,.10), transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(45,212,191,.10), transparent 42%);
    }
  `;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 bingo-grid-bg flex flex-col items-center justify-center text-white p-4">
        <style>{localStyles}</style>
        <div className="text-center space-y-5">
          <div className="relative mx-auto w-16 h-16">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-emerald-400 border-r-transparent border-b-teal-400 border-l-transparent"></div>
            <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-emerald-400 animate-float" />
          </div>
          <h2 className="text-xl font-bold tracking-wide text-slate-100">Syncing Bingo Servers…</h2>
          <p className="text-sm text-slate-400">Loading active game lobbies securely…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 bingo-grid-bg text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      <style>{localStyles}</style>

      {/* HEADER BAR */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800/85 py-4 px-6 sticky top-0 z-20 shadow-xl">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 font-black p-2.5 rounded-xl shadow-lg tracking-wider text-xl flex items-center gap-1.5 animate-glow">
              <Sparkles className="w-5 h-5 fill-slate-950" />
              BINGO!
            </div>
            <div>
              <h1 className="font-extrabold text-2xl bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                Multiplayer Arena
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                <p className="text-xs text-slate-400">Real-time Game Servers Active</p>
              </div>
            </div>
          </div>

          {isJoined && currentRoom && (
            <div className="flex items-center gap-2.5 bg-slate-800/80 py-1.5 px-4 rounded-xl border border-slate-700/60 shadow-inner">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                {currentRoom.isPrivate ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                {currentRoom.isPrivate ? 'PRIVATE CODE' : 'ROOM CODE'}
              </span>
              <button
                onClick={copyRoomId}
                className="bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-emerald-300 font-bold px-3 py-1 rounded-lg text-sm flex items-center gap-1.5 border border-slate-600"
                title="Click to copy Room Code"
              >
                {currentRoom.roomName || roomId}
                {copyFeedback ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400 stroke-[3]" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-emerald-300 transition" />
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* NOTIFICATIONS */}
      {errorMessage && (
        <div className="bg-red-950/80 border-b border-red-800 text-red-200 text-center py-3 px-4 text-sm font-semibold flex justify-center items-center gap-2 animate-fade-in">
          <span className="bg-red-500/20 text-red-400 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide">Error</span>
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="ml-4 hover:text-white font-black text-lg transition">&times;</button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/80 border-b border-emerald-800 text-emerald-200 text-center py-3 px-4 text-sm font-semibold flex justify-center items-center gap-2 animate-fade-in">
          <span className="bg-emerald-500/20 text-emerald-400 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide">Success</span>
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="ml-4 hover:text-white font-black text-lg transition">&times;</button>
        </div>
      )}

      {/* MAIN GAME CONTAINER */}
      <main className="flex-grow max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-start">

        {/* ROOM LOBBY ENTRANCE */}
        {!isJoined ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start my-auto max-w-4xl w-full mx-auto mt-6 sm:mt-12">

            {/* LEFT COLUMN: PLAYER DETAILS & ROOM BUILDER */}
            <div className="bg-slate-900/90 p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-800/80 space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-white">1. Enter Your Profile</h2>
                <p className="text-xs text-slate-400">Your profile is saved automatically for continuous play.</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Your Player Name</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="e.g. Maverick"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.substring(0, 15))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="border-t border-slate-800 pt-5 space-y-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-white">2. Create or Join a Room</h2>
                  <p className="text-xs text-slate-400">Enter a name to create a room, or a friend's code to join theirs.</p>
                </div>

                <input
                  type="text"
                  placeholder="e.g. Maverick's Party"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value.substring(0, 30))}
                  onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(roomNameInput); }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />

                {/* PUBLIC / PRIVATE TOGGLE (applies when creating) */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black transition-all ${
                      !isPrivate ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" /> Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black transition-all ${
                      isPrivate ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" /> Private
                  </button>
                </div>

                {/* CREATE + JOIN actions share the field above */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={createRoom}
                    disabled={!roomNameInput.trim()}
                    className={`bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black py-3 px-3 rounded-xl shadow-lg flex items-center justify-center gap-1.5 text-sm transition-all ${
                      !roomNameInput.trim() ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-emerald-500/25'
                    }`}
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Create
                  </button>
                  <button
                    onClick={() => joinRoom(roomNameInput)}
                    disabled={!roomNameInput.trim()}
                    className={`bg-slate-800 hover:bg-slate-700 text-white font-black py-3 px-3 rounded-xl border border-slate-700 shadow-lg flex items-center justify-center gap-1.5 text-sm transition-all ${
                      !roomNameInput.trim() ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                  >
                    <KeyRound className="w-4 h-4 stroke-[2.5]" />
                    Join by Code
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5 leading-relaxed">
                  {isPrivate
                    ? <><Lock className="w-3 h-3 shrink-0 text-amber-400" /> New rooms stay hidden — share the code to invite friends.</>
                    : <><Globe className="w-3 h-3 shrink-0 text-emerald-400" /> New rooms are listed publicly for anyone to join.</>}
                </p>
              </div>
            </div>

            {/* RIGHT COLUMN: PUBLIC ROOMS DROPDOWN */}
            <div className="bg-slate-900/95 p-6 sm:p-8 rounded-2xl shadow-2xl border border-slate-800/90 space-y-5 flex flex-col">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-black text-white flex items-center gap-1.5">
                    <Globe className="w-5 h-5 text-teal-400 animate-spin-slow" />
                    Join a Public Room
                  </h2>
                  <span className="bg-slate-800 text-emerald-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-slate-700/60 animate-pulse">
                    {availableRooms.length} Open
                  </span>
                </div>
                <p className="text-xs text-slate-400">Pick an open lobby from the menu to jump straight in. Private rooms won't appear here — use their code.</p>
              </div>

              {/* PUBLIC ROOMS DROPDOWN MENU */}
              <div className="relative" ref={roomsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsRoomsOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={isRoomsOpen}
                  className={`w-full flex items-center justify-between gap-3 bg-slate-950 border rounded-xl py-3.5 px-4 text-left transition-all ${
                    isRoomsOpen ? 'border-emerald-500/60 ring-2 ring-emerald-500/20' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-sm font-bold text-slate-200 truncate">
                      {availableRooms.length === 0 ? 'No public rooms available' : 'Select a room to join…'}
                    </span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isRoomsOpen ? 'rotate-180 text-emerald-400' : ''}`} />
                </button>

                {isRoomsOpen && (
                  <div
                    role="listbox"
                    className="absolute z-30 mt-2 w-full bg-slate-950 border border-slate-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in"
                  >
                    <div className="max-h-72 overflow-y-auto bingo-scroll p-1.5 space-y-1">
                      {availableRooms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 px-4">
                          <HelpCircle className="w-8 h-8 text-slate-600" />
                          <div>
                            <p className="text-sm font-bold text-slate-300">No public rooms right now</p>
                            <p className="text-xs text-slate-500 mt-1">Launch your own room, or join a private one with a code!</p>
                          </div>
                        </div>
                      ) : (
                        availableRooms.map((room) => (
                          <button
                            key={room.id}
                            role="option"
                            onClick={() => { setIsRoomsOpen(false); joinRoom(room.id); }}
                            className="group w-full text-left p-3 rounded-lg bg-transparent hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/40 transition-all flex justify-between items-center gap-3"
                          >
                            <div className="truncate space-y-0.5">
                              <p className="text-sm font-black text-slate-100 truncate group-hover:text-emerald-300">{room.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono tracking-wider flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-emerald-400/80">
                                  {room.playerCount} playing
                                </span>
                                <span className="truncate">code: {room.id}</span>
                              </p>
                            </div>
                            <span className="bg-emerald-500/15 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-slate-950 text-xs font-black py-1.5 px-3 rounded-lg border border-emerald-500/30 transition-all flex items-center gap-1 shrink-0">
                              <UserPlus className="w-3.5 h-3.5" />
                              Join
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[10px] text-slate-600 text-center pt-1">
                {availableRooms.length} {availableRooms.length === 1 ? 'room is' : 'rooms are'} live · list auto-updates in real-time.
              </div>
            </div>

          </div>
        ) : (
          /* GAME ACTIVE ROOM CONTAINER */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* LEFT SIDE PANEL */}
            <div className="lg:col-span-4 space-y-6">

              {/* STATUS CARD */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Arena Status</h3>

                {currentRoom?.status === 'setup' && (
                  <div className="space-y-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 animate-pulse">
                      ⏳ SETUP: Arrange Board
                    </span>
                    {currentRoom?.isPrivate && (
                      <span className="inline-flex items-center gap-1 ml-2 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        <Lock className="w-3 h-3" /> Private
                      </span>
                    )}
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Fill your 5×5 board manually or hit <strong>Randomize</strong>. All players must press <strong>Lock &amp; Ready</strong> to start the game!
                    </p>
                  </div>
                )}

                {currentRoom?.status === 'playing' && (
                  <div className="space-y-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                      🎮 BATTLE IN PROGRESS
                    </span>
                    <div className="mt-1">
                      {getActiveTurnUser()?.uid === user.uid ? (
                        <p className="text-emerald-400 font-black text-base animate-pulse flex items-center gap-1.5">
                          <Flame className="w-4 h-4 fill-emerald-400 animate-bounce" />
                          YOUR TURN: Pick a number!
                        </p>
                      ) : (
                        <p className="text-xs text-slate-300">
                          Waiting for <strong className="text-teal-400">{getActiveTurnUser()?.name || 'Player'}</strong> to call…
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {currentRoom?.status === 'ended' && (
                  <div className="text-center space-y-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-purple-500/10 text-purple-400 border border-purple-500/25">
                      🏆 ARENA CONCLUDED
                    </span>
                    <div className="bg-purple-950/40 p-4 rounded-xl border border-purple-900/60 shadow-inner">
                      <p className="text-[10px] text-purple-300 font-bold uppercase tracking-wider mb-1">Champions</p>
                      <p className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500">
                        {currentRoom.winners?.join(' & ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* GAME CONTROL BUTTONS */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col gap-2">
                  {currentRoom?.status === 'setup' && isRoomMaster && (
                    <button
                      onClick={startGame}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-black py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-slate-950 stroke-none" />
                      Start Game (Host)
                    </button>
                  )}

                  {currentRoom?.status === 'ended' && isRoomMaster && (
                    <button
                      onClick={restartGame}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-2.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reset and Replay
                    </button>
                  )}

                  <button
                    onClick={leaveRoom}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-red-400 font-bold py-2.5 px-4 rounded-xl border border-slate-700/60 transition flex items-center justify-center gap-2 text-xs"
                  >
                    <LogOut className="w-4 h-4" />
                    Leave Room
                  </button>
                </div>
              </div>

              {/* PLAYERS & LEADERBOARD */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Players</h3>
                  <span className="bg-slate-800 text-slate-300 text-xs font-black px-2.5 py-0.5 rounded-full border border-slate-700/60">
                    {getPlayersList().length} Online
                  </span>
                </div>

                <div className="space-y-2.5">
                  {getPlayersList().map((player) => {
                    const isTurn = currentRoom?.status === 'playing' && currentRoom.turnOrder[currentRoom.currentTurnIndex] === player.uid;
                    const linesCompleted = player.bingoLinesCount || 0;

                    return (
                      <div
                        key={player.uid}
                        className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                          isTurn ? 'bg-emerald-950/40 border border-emerald-500/40' : 'bg-slate-950 border border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {isTurn ? (
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                          ) : (
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${player.isReady ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                          )}

                          <div className="truncate">
                            <p className="text-xs font-extrabold text-slate-200 flex items-center gap-1.5">
                              <span className="truncate">{player.name}</span>
                              {player.uid === user.uid && <span className="text-[9px] text-slate-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">You</span>}
                              {currentRoom.createdBy === player.uid && <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 border border-amber-500/20 rounded">Host</span>}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {currentRoom.status === 'setup' ? (
                                player.isReady ? 'Ready to battle!' : 'Setting up board…'
                              ) : (
                                `${linesCompleted} lines crossed`
                              )}
                            </p>
                          </div>
                        </div>

                        {currentRoom.status !== 'setup' && (
                          <div className="text-right">
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: 5 }).map((_, idx) => (
                                <span
                                  key={idx}
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    idx < linesCompleted
                                      ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                                      : 'bg-slate-800'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[9px] text-slate-400 block mt-0.5">{linesCompleted} / 5 Lines</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CALLED HISTORIC NUMBERS */}
              {currentRoom?.status === 'playing' && (
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Called History</h3>
                  {currentRoom.calledNumbers.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-2">No numbers called yet!</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1 bingo-scroll">
                      {currentRoom.calledNumbers.slice().reverse().map((num, i) => (
                        <span
                          key={i}
                          className={`flex items-center justify-center text-xs font-black w-7 h-7 rounded-lg border ${
                            i === 0
                              ? 'bg-amber-500 text-slate-950 border-amber-400 scale-110 shadow-md shadow-amber-500/25 animate-pulse'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* RIGHT SIDE PANEL: PLAY BOARD (BINGO SQUARE) */}
            <div className="lg:col-span-8 space-y-6">

              {/* PLAYING GRID BLOCK */}
              <div className="bg-slate-900 p-5 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center">

                {/* IN-GAME MOTIVATION / ACTION PROMPTS */}
                <div className="w-full text-center mb-6">
                  {currentRoom?.status === 'setup' ? (
                    <div className="space-y-3">
                      <h2 className="text-xl font-black text-white">Grid Board Builder</h2>
                      <p className="text-xs text-slate-400">
                        {isReady
                          ? "Locked in! Waiting for the room master to start."
                          : `Place number ${selectedSetupNumber > 25 ? '—' : selectedSetupNumber} by clicking on empty tiles.`
                        }
                      </p>

                      {!isReady && (
                        <div className="flex justify-center gap-2 mt-2">
                          <button
                            onClick={randomizeBoard}
                            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg border border-slate-700 transition"
                          >
                            🎲 Quick Random
                          </button>
                          <button
                            onClick={clearBoard}
                            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg border border-slate-700 transition"
                          >
                            🧹 Clear Grid
                          </button>
                        </div>
                      )}

                      <div className="mt-4">
                        <button
                          onClick={toggleReady}
                          disabled={board.includes(null)}
                          className={`py-2.5 px-6 rounded-full font-black text-xs transition-all ${
                            board.includes(null)
                              ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                              : isReady
                              ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg'
                              : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-lg animate-glow'
                          }`}
                        >
                          {isReady ? '🔒 Board Locked (Change)' : '🔓 Lock & Mark Ready'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-3xl font-black text-white flex items-center justify-center gap-2 tracking-wide">
                        <span>B</span>
                        <span className="text-emerald-400">I</span>
                        <span className="text-amber-400">N</span>
                        <span className="text-orange-400">G</span>
                        <span className="text-red-400">O</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        Select an available tile during your turn to cross it out on everyone's board.
                      </p>
                    </div>
                  )}
                </div>

                {/* THE 5x5 BOARD GRID */}
                <div className="relative w-full max-w-md aspect-square bg-slate-950 p-3 sm:p-5 rounded-2xl border border-slate-800 shadow-inner">

                  {/* Winning Strike overlay if game ended */}
                  {currentRoom?.status === 'ended' && (
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm rounded-2xl flex flex-col justify-center items-center p-6 z-10 text-center animate-fade-in">
                      <Trophy className="w-16 h-16 text-yellow-400 mb-4 animate-bounce" />
                      <h3 className="text-2xl font-black text-white">WE HAVE A BINGO!</h3>
                      <p className="text-slate-400 text-xs mt-1 mb-4">The battle has completed.</p>

                      <div className="space-y-1">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Winning Player(s)</p>
                        {currentRoom.winners?.map((w, idx) => (
                          <p key={idx} className="text-lg font-black text-amber-400">{w}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-5 gap-2 sm:gap-3 h-full w-full">
                    {board.map((val, idx) => {
                      const isCalled = val !== null && currentRoom?.calledNumbers?.includes(val);
                      const isTurnOwner = currentRoom?.status === 'playing' && currentRoom.turnOrder[currentRoom.currentTurnIndex] === user.uid;
                      const selectableInTurn = currentRoom?.status === 'playing' && isTurnOwner && !isCalled;

                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (currentRoom?.status === 'setup') {
                              handleCellSetupClick(idx);
                            } else if (selectableInTurn && val !== null) {
                              callNumber(val);
                            }
                          }}
                          disabled={
                            currentRoom?.status === 'playing' && (!isTurnOwner || isCalled)
                          }
                          className={`relative rounded-xl font-black sm:text-2xl text-lg flex items-center justify-center transition-all aspect-square outline-none ${
                            currentRoom?.status === 'setup'
                              ? val === null
                                ? 'bg-slate-900/30 hover:bg-slate-900 border-2 border-dashed border-slate-800 text-slate-700 hover:border-emerald-600/60'
                                : 'bg-slate-800 text-white border border-slate-700 hover:bg-slate-700'
                              : isCalled
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 border-emerald-300 shadow-lg shadow-emerald-500/20 scale-[0.98]'
                              : selectableInTurn
                              ? 'bg-slate-900 hover:bg-slate-800 border-2 border-emerald-500/50 text-emerald-400 hover:scale-105 active:scale-95'
                              : 'bg-slate-900 text-slate-500 border border-slate-800/80 cursor-not-allowed'
                          }`}
                        >
                          {val !== null ? val : ''}

                          {/* Checked Crossed Mark Icon */}
                          {currentRoom?.status === 'playing' && isCalled && (
                            <span className="absolute bottom-1 right-1.5 bg-slate-950/60 text-[8px] sm:text-[10px] text-white px-1 py-0.5 rounded-full leading-none font-bold">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* GAME STATS SUMMARY AT BOTTOM */}
                {currentRoom?.status === 'playing' && (
                  <div className="w-full mt-6 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="text-center sm:text-left">
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Your Progress</p>
                      <p className="text-lg font-black text-emerald-400 mt-0.5">
                        {calculateCompletedLines(board, currentRoom.calledNumbers)} / 5 Lines Completed
                      </p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex gap-4 text-center">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Grid Total</span>
                        <span className="text-xs font-bold text-slate-200">25 / 25</span>
                      </div>
                      <div className="border-l border-slate-800 pl-4">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Turn History</span>
                        <span className="text-xs font-bold text-amber-400">{currentRoom.calledNumbers.length} called</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* HOW TO PLAY */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800/80 shadow-md">
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-widest mb-2">How to Play:</h4>
                <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                  <li>Fill up your 5×5 board with numbers 1 to 25. No duplicates!</li>
                  <li>Click 'Lock &amp; Mark Ready' when satisfied.</li>
                  <li>Once the Room Master kicks off the game, players take turns calling a number from their board.</li>
                  <li>When a number is called, all players instantly cross that number out if it resides on their board.</li>
                  <li>The first player to complete 5 lines (rows, columns, or diagonals) wins the BINGO!</li>
                </ol>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-950 py-6 mt-12 border-t border-slate-900 text-center text-xs text-slate-600">
        <div className="max-w-6xl mx-auto px-4">
          <p>© 2026 Real-time Bingo Arena. Fully authenticated and synchronized securely.</p>
        </div>
      </footer>

    </div>
  );
}
