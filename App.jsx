import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField
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
  Users,
  Dice5,
  Eraser,
  ShieldCheck,
  Activity,
  ListChecks,
  Crown,
  RadioTower
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
const demoRoomsStorageKey = `${appId}:demoRooms`;

const getDemoRooms = () => {
  try {
    return JSON.parse(localStorage.getItem(demoRoomsStorageKey) || '{}');
  } catch {
    return {};
  }
};

const saveDemoRooms = (rooms) => {
  localStorage.setItem(demoRoomsStorageKey, JSON.stringify(rooms));
};

const seedDemoRooms = () => {
  const existingRooms = getDemoRooms();
  const seededRooms = {
    'friday-fun-night': {
      id: 'friday-fun-night',
      roomName: 'Friday Fun Night',
      isPrivate: false,
      status: 'setup',
      createdBy: 'demo-host-friday',
      players: {
        'demo-host-friday': { uid: 'demo-host-friday', name: 'Ari', isReady: false, bingoLinesCount: 0, joinedAt: Date.now() - 3000 },
        'demo-guest-friday': { uid: 'demo-guest-friday', name: 'Mina', isReady: false, bingoLinesCount: 0, joinedAt: Date.now() - 2000 },
        'demo-pro-friday': { uid: 'demo-pro-friday', name: 'Dev', isReady: false, bingoLinesCount: 0, joinedAt: Date.now() - 1000 }
      },
      calledNumbers: [],
      turnOrder: ['demo-host-friday', 'demo-guest-friday', 'demo-pro-friday'],
      currentTurnIndex: 0,
      winners: [],
      createdAt: Date.now() - 3000
    },
    'office-league': {
      id: 'office-league',
      roomName: 'Office League',
      isPrivate: false,
      status: 'setup',
      createdBy: 'demo-host-office',
      players: {
        'demo-host-office': { uid: 'demo-host-office', name: 'Noor', isReady: false, bingoLinesCount: 0, joinedAt: Date.now() - 4000 },
        'demo-guest-office': { uid: 'demo-guest-office', name: 'Sam', isReady: false, bingoLinesCount: 0, joinedAt: Date.now() - 3000 }
      },
      calledNumbers: [],
      turnOrder: ['demo-host-office', 'demo-guest-office'],
      currentTurnIndex: 0,
      winners: [],
      createdAt: Date.now() - 4000
    }
  };

  const mergedRooms = { ...seededRooms, ...existingRooms };
  saveDemoRooms(mergedRooms);
  return mergedRooms;
};

export default function App() {
  // Auth and Room State
  const [user, setUser] = useState(null);
  const [playerId] = useState(() => {
    const existingPlayerId = sessionStorage.getItem('bingo_player_id');
    const nextPlayerId = existingPlayerId || 'player-' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('bingo_player_id', nextPlayerId);
    return nextPlayerId;
  });
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
    const rooms = getDemoRooms();
    const sourceRoom = rooms[roomId] || currentRoom;
    if (!sourceRoom) return;

    const updatedRoom = updater(JSON.parse(JSON.stringify(sourceRoom)));
    const nextRooms = { ...rooms, [updatedRoom.id || roomId]: updatedRoom };
    saveDemoRooms(nextRooms);
    setCurrentRoom(updatedRoom);
    setIsRoomMaster(updatedRoom.createdBy === playerId);
  };

  // 1. Authenticate user on mount
  useEffect(() => {
    if (isDemo) {
      // Skip real auth; spin up a throwaway local player.
      const demoUid = playerId;
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
  }, [playerId]);

  // 2. Fetch and Sync Active Rooms List (fetch & filter in-memory).
  //    Private rooms are intentionally excluded from the public lobby.
  useEffect(() => {
    if (!user) return;

    if (isDemo) {
      const syncDemoLobby = () => {
        const rooms = seedDemoRooms();
        const roomsList = Object.values(rooms)
          .filter((room) => room.status === 'setup' && !room.isPrivate)
          .map((room) => ({
            id: room.id,
            name: room.roomName || room.id,
            playerCount: room.players ? Object.keys(room.players).length : 0,
            createdBy: room.createdBy
          }))
          .sort((a, b) => b.playerCount - a.playerCount);
        setAvailableRooms(roomsList);
      };

      syncDemoLobby();
      const handleDemoRoomsChange = (event) => {
        if (event.key === demoRoomsStorageKey) syncDemoLobby();
      };
      window.addEventListener('storage', handleDemoRoomsChange);
      return () => window.removeEventListener('storage', handleDemoRoomsChange);
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

  // Sync shared demo rooms across tabs/windows in preview mode.
  useEffect(() => {
    if (!isDemo || !user || !roomId || !isJoined) return;

    const syncJoinedDemoRoom = () => {
      const rooms = getDemoRooms();
      const room = rooms[roomId];
      if (room) {
        setCurrentRoom(room);
        setIsRoomMaster(room.createdBy === playerId);
      } else {
        setErrorMessage("This room is no longer active.");
        setIsJoined(false);
        setCurrentRoom(null);
      }
    };

    syncJoinedDemoRoom();
    const handleDemoRoomsChange = (event) => {
      if (event.key === demoRoomsStorageKey) syncJoinedDemoRoom();
    };
    window.addEventListener('storage', handleDemoRoomsChange);
    return () => window.removeEventListener('storage', handleDemoRoomsChange);
  }, [user, playerId, roomId, isJoined]);

  // 3. Real-time Game State Sync
  useEffect(() => {
    if (!user || !roomId || !isJoined) return;
    if (isDemo) return; // Demo rooms are synced with localStorage above.

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);

    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCurrentRoom(data);
        setIsRoomMaster(data.createdBy === playerId);
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
  }, [user, playerId, roomId, isJoined]);

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
      createdBy: playerId,
      players: {
        [playerId]: {
          uid: playerId,
          authUid: user.uid,
          name: playerName.trim(),
          isReady: false,
          bingoLinesCount: 0,
          joinedAt: Date.now()
        }
      },
      calledNumbers: [],
      turnOrder: [playerId],
      currentTurnIndex: 0,
      winners: [],
      createdAt: Date.now()
    });

    if (isDemo) {
      const demoRoom = buildRoomData();
      const rooms = getDemoRooms();
      if (rooms[generatedRoomId] && rooms[generatedRoomId].status !== 'ended') {
        setErrorMessage("A room with that name is already active. Join it by code or pick a unique name.");
        return;
      }
      saveDemoRooms({ ...rooms, [generatedRoomId]: demoRoom });
      setCurrentRoom(demoRoom);
      setRoomId(generatedRoomId);
      setIsJoined(true);
      setIsRoomMaster(true);
      setSuccessMessage(`Demo room "${cleanRoomName}" created!`);
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
      const rooms = seedDemoRooms();
      const existingRoom = rooms[cleanRoomId];
      if (!existingRoom) {
        setErrorMessage(`No room found with that code. Double-check the spelling.`);
        return;
      }
      if (existingRoom.status !== 'setup') {
        setErrorMessage("This game is already in progress.");
        return;
      }

      const joinedRoom = {
        ...existingRoom,
        players: {
          ...existingRoom.players,
          [playerId]: {
            uid: playerId,
            authUid: user.uid,
            name: playerName.trim(),
            isReady: false,
            bingoLinesCount: 0,
            joinedAt: existingRoom.players?.[playerId]?.joinedAt || Date.now()
          }
        },
        turnOrder: existingRoom.turnOrder?.includes(playerId)
          ? existingRoom.turnOrder
          : [...(existingRoom.turnOrder || []), playerId]
      };

      saveDemoRooms({ ...rooms, [cleanRoomId]: joinedRoom });
      setCurrentRoom(joinedRoom);
      setRoomId(cleanRoomId);
      setIsJoined(true);
      setIsRoomMaster(joinedRoom.createdBy === playerId);
      setRoomNameInput('');
      setSuccessMessage(`Joined ${joinedRoom.roomName || cleanRoomId}!`);
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

      await updateDoc(roomRef, {
        [`players.${playerId}`]: {
          uid: playerId,
          authUid: user.uid,
          name: playerName.trim(),
          isReady: false,
          bingoLinesCount: 0,
          joinedAt: roomData.players?.[playerId]?.joinedAt || Date.now()
        },
        turnOrder: arrayUnion(playerId)
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
      const rooms = getDemoRooms();
      const room = rooms[roomId];
      if (room) {
        const updatedPlayers = { ...(room.players || {}) };
        delete updatedPlayers[playerId];
        const updatedTurnOrder = (room.turnOrder || []).filter(uid => uid !== playerId);
        const updatedRoom = {
          ...room,
          players: updatedPlayers,
          turnOrder: updatedTurnOrder,
          createdBy: room.createdBy === playerId && updatedTurnOrder.length > 0
            ? updatedTurnOrder[0]
            : room.createdBy
        };
        saveDemoRooms({ ...rooms, [roomId]: updatedRoom });
      }
      setIsJoined(false);
      setCurrentRoom(null);
      setIsReady(false);
      setBoard(Array(25).fill(null));
      setSelectedSetupNumber(1);
      return;
    }
    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      const updatedTurnOrder = currentRoom.turnOrder.filter(uid => uid !== playerId);
      let newCreatedBy = currentRoom.createdBy;

      if (currentRoom.createdBy === playerId && updatedTurnOrder.length > 0) {
        newCreatedBy = updatedTurnOrder[0];
      }

      await updateDoc(roomRef, {
        [`players.${playerId}`]: deleteField(),
        turnOrder: arrayRemove(playerId),
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
        r.players[playerId].isReady = newReadyState;
        return r;
      });
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await updateDoc(roomRef, {
        [`players.${playerId}.isReady`]: newReadyState
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
    if (turnOwnerUid !== playerId) {
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
        r.players[playerId].bingoLinesCount = localLines;
        return r;
      });
      return;
    }

    try {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      await updateDoc(roomRef, {
        calledNumbers: newCalledNumbers,
        currentTurnIndex: nextTurnIndex,
        [`players.${playerId}.bingoLinesCount`]: localLines
      });
    } catch (err) {
      console.error("Error calling number:", err);
      setErrorMessage("Error recording play. Try again.");
    }
  };

  useEffect(() => {
    if (!currentRoom || currentRoom.status !== 'playing' || !isJoined || !user) return;

    const localLines = calculateCompletedLines(board, currentRoom.calledNumbers);
    const serverPlayerState = currentRoom.players[playerId];

    if (!isDemo && serverPlayerState && serverPlayerState.bingoLinesCount !== localLines) {
      const updateLinesOnServer = async () => {
        try {
          const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
          await updateDoc(roomRef, {
            [`players.${playerId}.bingoLinesCount`]: localLines
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
  }, [currentRoom?.calledNumbers, board, currentRoom?.status, user, playerId, roomId, isJoined]);

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

  const totalPlayers = currentRoom ? Object.keys(currentRoom.players || {}).length : 0;
  const readyPlayers = currentRoom
    ? Object.values(currentRoom.players || {}).filter((player) => player.isReady).length
    : 0;
  const localCompletedLines = currentRoom
    ? calculateCompletedLines(board, currentRoom.calledNumbers || [])
    : 0;

  // Local keyframes so the animation utility classes actually do something
  // even on a CDN Tailwind build that doesn't define them.
  const localStyles = `
    @keyframes bingoFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes bingoSpinSlow { to { transform: rotate(360deg); } }
    @keyframes bingoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes bingoGlow { 0%,100% { box-shadow: 0 0 20px -8px rgba(250,204,21,.65); } 50% { box-shadow: 0 0 32px -8px rgba(34,211,238,.8); } }
    .animate-fade-in { animation: bingoFadeIn .35s ease-out; }
    .animate-spin-slow { animation: bingoSpinSlow 6s linear infinite; }
    .animate-float { animation: bingoFloat 4s ease-in-out infinite; }
    .animate-glow { animation: bingoGlow 2.4s ease-in-out infinite; }
    .bingo-scroll::-webkit-scrollbar { width: 6px; }
    .bingo-scroll::-webkit-scrollbar-thumb { background: #475569; border-radius: 8px; }
    .bingo-grid-bg {
      background-image:
        linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px),
        linear-gradient(135deg, rgba(8,47,73,.42), rgba(15,23,42,.82) 46%, rgba(69,26,3,.34));
      background-size: 36px 36px, 36px 36px, auto;
    }
    .arena-panel {
      background: linear-gradient(180deg, rgba(15,23,42,.94), rgba(2,6,23,.98));
      border: 1px solid rgba(100,116,139,.38);
      border-radius: 8px;
      box-shadow: 0 18px 45px rgba(0,0,0,.32);
    }
    .arena-button {
      border-radius: 8px;
      min-height: 44px;
    }
    .arena-tile {
      border-radius: 8px;
      min-width: 0;
      min-height: 0;
    }
  `;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 bingo-grid-bg flex flex-col items-center justify-center text-white p-4">
        <style>{localStyles}</style>
        <div className="arena-panel text-center space-y-5 p-8 w-full max-w-sm">
          <div className="relative mx-auto w-16 h-16">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-cyan-300 border-r-transparent border-b-amber-300 border-l-transparent"></div>
            <RadioTower className="absolute inset-0 m-auto w-6 h-6 text-cyan-300 animate-float" />
          </div>
          <h2 className="text-xl font-bold tracking-wide text-slate-100">Opening Arena</h2>
          <p className="text-sm text-slate-400">Checking rooms and player session.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 bingo-grid-bg text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      <style>{localStyles}</style>

      {/* HEADER BAR */}
      <header className="bg-slate-950/88 backdrop-blur-md border-b border-slate-800/85 py-3 px-4 sm:px-6 sticky top-0 z-20 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-gradient-to-tr from-amber-300 via-cyan-300 to-emerald-300 text-slate-950 font-black h-11 w-11 rounded-lg shadow-lg tracking-wider flex items-center justify-center animate-glow shrink-0">
              <Sparkles className="w-5 h-5 fill-slate-950" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl sm:text-2xl bg-gradient-to-r from-amber-200 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
                Bingo Multiplayer Arena
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`h-2 w-2 rounded-full ${isDemo ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`}></span>
                <p className="text-xs text-slate-400">{isDemo ? 'Demo preview mode' : 'Firebase realtime mode'}</p>
              </div>
            </div>
          </div>

          {isJoined && currentRoom && (
            <div className="flex items-center justify-between sm:justify-start gap-2.5 bg-slate-900/90 py-2 px-3 rounded-lg border border-slate-700/70 shadow-inner">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                {currentRoom.isPrivate ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                {currentRoom.isPrivate ? 'Private' : 'Room'}
              </span>
              <button
                onClick={copyRoomId}
                className="bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-cyan-200 font-bold px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 border border-slate-600 min-w-0"
                title="Copy room code"
              >
                <span className="truncate max-w-[12rem]">{currentRoom.roomName || roomId}</span>
                {copyFeedback ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300 stroke-[3] shrink-0" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-cyan-200 transition shrink-0" />
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* NOTIFICATIONS */}
      {errorMessage && (
        <div className="bg-red-950/88 border-b border-red-800 text-red-100 text-center py-3 px-4 text-sm font-semibold flex justify-center items-center gap-2 animate-fade-in">
          <span className="bg-red-500/20 text-red-300 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide">Error</span>
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="ml-4 hover:text-white font-black text-lg transition" aria-label="Dismiss error">x</button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-950/88 border-b border-emerald-800 text-emerald-100 text-center py-3 px-4 text-sm font-semibold flex justify-center items-center gap-2 animate-fade-in">
          <span className="bg-emerald-500/20 text-emerald-300 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide">Success</span>
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="ml-4 hover:text-white font-black text-lg transition" aria-label="Dismiss message">x</button>
        </div>
      )}

      {/* MAIN GAME CONTAINER */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-start">

        {/* ROOM LOBBY ENTRANCE */}
        {!isJoined ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr] gap-6 items-start my-auto max-w-5xl w-full mx-auto mt-4 sm:mt-8">

            {/* LEFT COLUMN: PLAYER DETAILS & ROOM BUILDER */}
            <div className="arena-panel p-5 sm:p-6 space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-300" />
                  Player Setup
                </h2>
                <p className="text-xs text-slate-400">Saved locally for your next match.</p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Your Player Name</label>
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="e.g. Maverick"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value.substring(0, 15))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 px-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                />
              </div>

              <div className="border-t border-slate-800 pt-5 space-y-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-amber-300" />
                    Room Access
                  </h2>
                  <p className="text-xs text-slate-400">Create a room name or enter a shared code.</p>
                </div>

                <input
                  type="text"
                  placeholder="e.g. Maverick's Party"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value.substring(0, 30))}
                  onKeyDown={(e) => { if (e.key === 'Enter') joinRoom(roomNameInput); }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 px-4 text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                />

                {/* PUBLIC / PRIVATE TOGGLE (applies when creating) */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setIsPrivate(false)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-black transition-all ${
                      !isPrivate ? 'bg-cyan-300 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" /> Public
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(true)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-black transition-all ${
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
                    className={`arena-button bg-gradient-to-r from-cyan-300 to-emerald-300 hover:from-cyan-200 hover:to-emerald-200 text-slate-950 font-black py-3 px-3 shadow-lg flex items-center justify-center gap-1.5 text-sm transition-all ${
                      !roomNameInput.trim() ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-cyan-500/20'
                    }`}
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Create
                  </button>
                  <button
                    onClick={() => joinRoom(roomNameInput)}
                    disabled={!roomNameInput.trim()}
                    className={`arena-button bg-slate-800 hover:bg-slate-700 text-white font-black py-3 px-3 border border-slate-700 shadow-lg flex items-center justify-center gap-1.5 text-sm transition-all ${
                      !roomNameInput.trim() ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                  >
                    <KeyRound className="w-4 h-4 stroke-[2.5]" />
                    Join by Code
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5 leading-relaxed">
                  {isPrivate
                    ? <><Lock className="w-3 h-3 shrink-0 text-amber-400" /> New rooms stay hidden. Share the code to invite friends.</>
                    : <><Globe className="w-3 h-3 shrink-0 text-cyan-300" /> New rooms appear in the public lobby.</>}
                </p>
              </div>
            </div>

            {/* RIGHT COLUMN: PUBLIC ROOMS DROPDOWN */}
            <div className="arena-panel p-5 sm:p-6 space-y-5 flex flex-col">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-black text-white flex items-center gap-1.5">
                    <Globe className="w-5 h-5 text-cyan-300" />
                    Public Rooms
                  </h2>
                  <span className="bg-slate-800 text-cyan-200 text-xs font-bold px-2.5 py-0.5 rounded border border-slate-700/60 animate-pulse">
                    {availableRooms.length} Open
                  </span>
                </div>
                <p className="text-xs text-slate-400">Open lobbies update in realtime. Private rooms stay code-only.</p>
              </div>

              {/* PUBLIC ROOMS DROPDOWN MENU */}
              <div className="relative" ref={roomsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsRoomsOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={isRoomsOpen}
                  className={`w-full flex items-center justify-between gap-3 bg-slate-950 border rounded-lg py-3.5 px-4 text-left transition-all ${
                    isRoomsOpen ? 'border-cyan-400/70 ring-2 ring-cyan-400/20' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-cyan-300 shrink-0" />
                    <span className="text-sm font-bold text-slate-200 truncate">
                      {availableRooms.length === 0 ? 'No public rooms available' : 'Select a room to join'}
                    </span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isRoomsOpen ? 'rotate-180 text-cyan-300' : ''}`} />
                </button>

                {isRoomsOpen && (
                  <div
                    role="listbox"
                    className="absolute z-30 mt-2 w-full bg-slate-950 border border-slate-700 rounded-lg shadow-2xl shadow-black/50 overflow-hidden animate-fade-in"
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
                            className="group w-full text-left p-3 rounded-lg bg-transparent hover:bg-cyan-500/10 border border-transparent hover:border-cyan-400/40 transition-all flex justify-between items-center gap-3"
                          >
                            <div className="truncate space-y-0.5">
                              <p className="text-sm font-black text-slate-100 truncate group-hover:text-cyan-200">{room.name}</p>
                              <p className="text-[10px] text-slate-500 font-mono tracking-wider flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded text-amber-200/90">
                                  {room.playerCount} playing
                                </span>
                                <span className="truncate">code: {room.id}</span>
                              </p>
                            </div>
                            <span className="bg-cyan-500/15 group-hover:bg-cyan-300 text-cyan-200 group-hover:text-slate-950 text-xs font-black py-1.5 px-3 rounded-lg border border-cyan-400/30 transition-all flex items-center gap-1 shrink-0">
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
                {availableRooms.length} {availableRooms.length === 1 ? 'room is' : 'rooms are'} live.
              </div>
            </div>

          </div>
        ) : (
          /* GAME ACTIVE ROOM CONTAINER */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* LEFT SIDE PANEL */}
            <div className="lg:col-span-4 space-y-6">

              <div className="grid grid-cols-3 gap-2">
                <div className="arena-panel p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Players</p>
                  <p className="text-xl font-black text-white mt-1">{totalPlayers}</p>
                </div>
                <div className="arena-panel p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Ready</p>
                  <p className="text-xl font-black text-amber-200 mt-1">{readyPlayers}/{totalPlayers}</p>
                </div>
                <div className="arena-panel p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Lines</p>
                  <p className="text-xl font-black text-cyan-200 mt-1">{localCompletedLines}/5</p>
                </div>
              </div>

              {/* STATUS CARD */}
              <div className="arena-panel p-5">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Arena Status</h3>

                {currentRoom?.status === 'setup' && (
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25 animate-pulse">
                      <ListChecks className="w-3.5 h-3.5" />
                      Setup
                    </span>
                    {currentRoom?.isPrivate && (
                      <span className="inline-flex items-center gap-1 ml-2 px-3 py-1 rounded text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        <Lock className="w-3 h-3" /> Private
                      </span>
                    )}
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Fill your board and lock it when ready. The host starts after everyone is ready.
                    </p>
                  </div>
                )}

                {currentRoom?.status === 'playing' && (
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold bg-cyan-500/10 text-cyan-200 border border-cyan-400/25">
                      <Activity className="w-3.5 h-3.5" />
                      In Progress
                    </span>
                    <div className="mt-1">
                      {getActiveTurnUser()?.uid === playerId ? (
                        <p className="text-cyan-200 font-black text-base animate-pulse flex items-center gap-1.5">
                          <Flame className="w-4 h-4 fill-cyan-300 animate-bounce" />
                          Your turn
                        </p>
                      ) : (
                        <p className="text-xs text-slate-300">
                          Waiting for <strong className="text-cyan-200">{getActiveTurnUser()?.name || 'Player'}</strong> to call.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {currentRoom?.status === 'ended' && (
                  <div className="text-center space-y-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-black bg-amber-500/10 text-amber-300 border border-amber-500/25">
                      <Trophy className="w-3.5 h-3.5" />
                      Finished
                    </span>
                    <div className="bg-slate-950/70 p-4 rounded-lg border border-amber-500/30 shadow-inner">
                      <p className="text-[10px] text-amber-200 font-bold uppercase tracking-wider mb-1">Champions</p>
                      <p className="text-xl font-black text-amber-200">
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
                      className="arena-button w-full bg-gradient-to-r from-cyan-300 to-emerald-300 hover:from-cyan-200 hover:to-emerald-200 text-slate-950 font-black py-2.5 px-4 shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-slate-950 stroke-none" />
                      Start Match
                    </button>
                  )}

                  {currentRoom?.status === 'ended' && isRoomMaster && (
                    <button
                      onClick={restartGame}
                      className="arena-button w-full bg-amber-300 hover:bg-amber-200 text-slate-950 font-black py-2.5 px-4 shadow-md transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Replay
                    </button>
                  )}

                  <button
                    onClick={leaveRoom}
                    className="arena-button w-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-red-300 font-bold py-2.5 px-4 border border-slate-700/60 transition flex items-center justify-center gap-2 text-xs"
                  >
                    <LogOut className="w-4 h-4" />
                    Leave Room
                  </button>
                </div>
              </div>

              {/* PLAYERS & LEADERBOARD */}
              <div className="arena-panel p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Players</h3>
                  <span className="bg-slate-800 text-slate-300 text-xs font-black px-2.5 py-0.5 rounded border border-slate-700/60">
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
                        className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                          isTurn ? 'bg-cyan-950/40 border border-cyan-400/40' : 'bg-slate-950 border border-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {isTurn ? (
                            <span className="h-2 w-2 rounded-full bg-cyan-300 animate-ping shrink-0" />
                          ) : (
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${player.isReady ? 'bg-emerald-300' : 'bg-slate-700'}`} />
                          )}

                          <div className="truncate">
                            <p className="text-xs font-extrabold text-slate-200 flex items-center gap-1.5">
                              <span className="truncate">{player.name}</span>
                              {player.uid === playerId && <span className="text-[9px] text-slate-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">You</span>}
                              {currentRoom.createdBy === player.uid && <span className="text-[9px] text-amber-300 font-bold bg-amber-500/10 px-1.5 py-0.5 border border-amber-500/20 rounded flex items-center gap-1"><Crown className="w-2.5 h-2.5" /> Host</span>}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {currentRoom.status === 'setup' ? (
                                player.isReady ? 'Ready' : 'Setting board'
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
                                      ? 'bg-amber-300 shadow-sm shadow-amber-300/50'
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
                <div className="arena-panel p-5">
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
                              ? 'bg-amber-300 text-slate-950 border-amber-200 scale-110 shadow-md shadow-amber-500/25 animate-pulse'
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
              <div className="arena-panel p-5 sm:p-6 flex flex-col items-center">

                {/* IN-GAME MOTIVATION / ACTION PROMPTS */}
                <div className="w-full text-center mb-6">
                  {currentRoom?.status === 'setup' ? (
                    <div className="space-y-3">
                      <h2 className="text-xl font-black text-white">Board Builder</h2>
                      <p className="text-xs text-slate-400">
                        {isReady
                          ? "Locked in! Waiting for the room master to start."
                          : `Place number ${selectedSetupNumber > 25 ? '-' : selectedSetupNumber} on an empty tile.`
                        }
                      </p>

                      {!isReady && (
                        <div className="flex flex-wrap justify-center gap-2 mt-2">
                          <button
                            onClick={randomizeBoard}
                            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 px-3 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                          >
                            <Dice5 className="w-3.5 h-3.5" />
                            Random
                          </button>
                          <button
                            onClick={clearBoard}
                            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold py-2 px-3 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
                          >
                            <Eraser className="w-3.5 h-3.5" />
                            Clear
                          </button>
                        </div>
                      )}

                      <div className="mt-4">
                        <button
                          onClick={toggleReady}
                          disabled={board.includes(null)}
                          className={`arena-button py-2.5 px-6 font-black text-xs transition-all flex items-center justify-center gap-2 mx-auto ${
                            board.includes(null)
                              ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-800'
                              : isReady
                              ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-lg'
                              : 'bg-cyan-300 hover:bg-cyan-200 text-slate-950 shadow-lg animate-glow'
                          }`}
                        >
                          {isReady ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          {isReady ? 'Unlock Board' : 'Lock Ready'}
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
                      <p className="text-xs text-slate-400 mt-1">Call a tile when the turn marker is yours.</p>
                    </div>
                  )}
                </div>

                {/* THE 5x5 BOARD GRID */}
                <div className="relative w-full max-w-md aspect-square bg-slate-950 p-3 sm:p-5 rounded-lg border border-slate-800 shadow-inner">

                  {/* Winning Strike overlay if game ended */}
                  {currentRoom?.status === 'ended' && (
                    <div className="absolute inset-0 bg-slate-950/92 backdrop-blur-sm rounded-lg flex flex-col justify-center items-center p-6 z-10 text-center animate-fade-in">
                      <Trophy className="w-16 h-16 text-yellow-400 mb-4 animate-bounce" />
                      <h3 className="text-2xl font-black text-white">Bingo</h3>
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
                      const isTurnOwner = currentRoom?.status === 'playing' && currentRoom.turnOrder[currentRoom.currentTurnIndex] === playerId;
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
                          className={`arena-tile relative font-black sm:text-2xl text-lg flex items-center justify-center transition-all aspect-square outline-none ${
                            currentRoom?.status === 'setup'
                              ? val === null
                                ? 'bg-slate-900/30 hover:bg-slate-900 border-2 border-dashed border-slate-800 text-slate-700 hover:border-cyan-400/60'
                                : 'bg-slate-800 text-white border border-slate-700 hover:bg-slate-700'
                              : isCalled
                              ? 'bg-gradient-to-br from-amber-300 to-cyan-300 text-slate-950 border-amber-200 shadow-lg shadow-cyan-500/20 scale-[0.98]'
                              : selectableInTurn
                              ? 'bg-slate-900 hover:bg-slate-800 border-2 border-cyan-400/60 text-cyan-200 hover:scale-105 active:scale-95'
                              : 'bg-slate-900 text-slate-500 border border-slate-800/80 cursor-not-allowed'
                          }`}
                        >
                          {val !== null ? val : ''}

                          {/* Checked Crossed Mark Icon */}
                          {currentRoom?.status === 'playing' && isCalled && (
                            <span className="absolute bottom-1 right-1.5 bg-slate-950/60 text-[8px] sm:text-[10px] text-white px-1 py-0.5 rounded-full leading-none font-bold">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* GAME STATS SUMMARY AT BOTTOM */}
                {currentRoom?.status === 'playing' && (
                  <div className="w-full mt-6 bg-slate-950 p-4 rounded-lg border border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="text-center sm:text-left">
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Your Progress</p>
                      <p className="text-lg font-black text-cyan-200 mt-0.5">
                        {localCompletedLines} / 5 Lines
                      </p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 flex gap-4 text-center">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Grid Total</span>
                        <span className="text-xs font-bold text-slate-200">25 / 25</span>
                      </div>
                      <div className="border-l border-slate-800 pl-4">
                        <span className="text-[9px] text-slate-400 uppercase tracking-widest block font-bold">Calls</span>
                        <span className="text-xs font-bold text-amber-200">{currentRoom.calledNumbers.length}</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* MATCH SUMMARY */}
              <div className="arena-panel p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-black">Room</p>
                  <p className="text-sm text-white font-bold truncate">{currentRoom?.roomName || roomId}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-black">Mode</p>
                  <p className="text-sm text-white font-bold">{currentRoom?.isPrivate ? 'Private' : 'Public'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-black">State</p>
                  <p className="text-sm text-white font-bold capitalize">{currentRoom?.status}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-black">Called</p>
                  <p className="text-sm text-white font-bold">{currentRoom?.calledNumbers?.length || 0} / 25</p>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-950 py-6 mt-12 border-t border-slate-900 text-center text-xs text-slate-600">
        <div className="max-w-6xl mx-auto px-4">
          <p>2026 Real-time Bingo Arena. Authenticated and synchronized with Firebase.</p>
        </div>
      </footer>

    </div>
  );
}
