import { useState, useEffect, useCallback } from "react";
import AuthPage from "@/pages/AuthPage";
import Home from "@/pages/Home";
import MainMenu from "@/pages/MainMenu";
import GamePage from "@/pages/GamePage";
import HyakuPage from "@/pages/HyakuPage";
import GachaPage from "@/pages/GachaPage";
import CollectionPage from "@/pages/CollectionPage";
import LevelUpPage from "@/pages/LevelUpPage";
import StageSelectPage from "@/pages/StageSelectPage";
import EquipGachaPage from "@/pages/EquipGachaPage";
import EquipmentPage from "@/pages/EquipmentPage";
import BossSelectPage from "@/pages/BossSelectPage";
import BossPage from "@/pages/BossPage";
import OnlineLobbyPage from "@/pages/OnlineLobbyPage";
import OnlineGamePage from "@/pages/OnlineGamePage";
import LegendGachaPage from "@/pages/LegendGachaPage";
import DefenseBattlePage from "@/pages/DefenseBattlePage";
import ItemBoxPage from "@/pages/ItemBoxPage";
import LimitedEventPage from "@/pages/LimitedEventPage";
import EventSurvivalPage from "@/pages/EventSurvivalPage";
import EventShinigamiPage from "@/pages/EventShinigamiPage";
import EventStrongestPage from "@/pages/EventStrongestPage";
import EventRaidPage from "@/pages/EventRaidPage";
import EventThemePage from "@/pages/EventThemePage";
import GunnerMasterPage from "@/pages/GunnerMasterPage";
import { load, save, computeEffectiveStats, clearLocal, setSaveHook, type PlayerData } from "@/store/playerStore";
import { getAuth, clearAuth, apiLogout, apiPutSave, apiGetSave } from "@/store/authStore";
import { FEATURES, apiFetch } from "@/lib/backend";
import { clearLocalEventRecords } from "@/lib/eventService";
import type { Difficulty } from "@/types/game";
import { STAGES, type StageDef } from "@/data/stages";
import type { EffectiveStats } from "@/lib/gameEngine";
import type { GameTransport } from "@/lib/gameTransport";

type Screen =
  | "auth" | "title" | "menu" | "stage-select" | "game"
  | "hyaku"
  | "boss-select" | "boss-fight"
  | "gacha" | "collection" | "levelup" | "equip-gacha" | "equipment"
  | "legend-gacha"
  | "online-lobby" | "online-game"
  | "defense" | "item-box"
  | "event-hub" | "event-survival" | "event-shinigami" | "event-strongest" | "event-raid" | "event-theme" | "event-gunner";

// 静的モード（アカウント機能なし）で MainMenu に表示する名前
const LOCAL_USERNAME = "プレイヤー";

export interface OnlineGameParams {
  role: 'host' | 'guest';
  myStats: EffectiveStats;
  opponentStats: EffectiveStats;
  stage: StageDef;
  transport: GameTransport;
}

export default function App() {
  const [screen, setScreen]         = useState<Screen>(FEATURES.accounts ? "auth" : "title");
  const [difficulty, setDiff]       = useState<Difficulty>("normal");
  const [stage, setStage]           = useState<StageDef>(STAGES[0]);
  const [selectedBoss, setBoss]     = useState<string>("lionel");
  const [onlineParams, setOnlineParams] = useState<OnlineGameParams | null>(null);
  const [username, setUsername]     = useState<string>(FEATURES.accounts ? '' : LOCAL_USERNAME);

  // Register save hook so every save() call syncs to server
  const setupSaveHook = useCallback((token: string) => {
    setSaveHook((data: PlayerData) => {
      apiPutSave(token, data);
    });
  }, []);

  // On mount: check existing auth session
  useEffect(() => {
    // 静的モード: ログイン不要。セーブは localStorage のみ。
    if (!FEATURES.accounts) return;

    const auth = getAuth();
    if (!auth) { setScreen("auth"); return; }

    // Verify session + load server data
    apiGetSave(auth.token).then(serverData => {
      if (serverData && Object.keys(serverData).length > 0) {
        const local = load();
        const merged = { ...local, ...(serverData as Partial<PlayerData>) };
        save(merged);
      }
      setupSaveHook(auth.token);
      setUsername(auth.username);
      setScreen("title");
    }).catch(() => {
      clearAuth();
      setScreen("auth");
    });
  }, [setupSaveHook]);

  const handleAuthSuccess = () => {
    const auth = getAuth();
    if (auth) {
      setupSaveHook(auth.token);
      setUsername(auth.username);
    }
    setScreen("title");
  };

  const handleLogout = async () => {
    if (!FEATURES.accounts) return;
    const auth = getAuth();
    if (auth) await apiLogout(auth.token);
    setSaveHook(null);
    clearAuth();
    setScreen("auth");
  };

  const handleNewGame = async () => {
    const auth = getAuth();
    if (auth) {
      // Delete account from server, then clear all local data
      try {
        await apiFetch('/api/auth/account', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${auth.token}` },
        });
      } catch {}
    }
    setSaveHook(null);
    clearAuth();
    clearLocal();
    clearLocalEventRecords();
    setScreen(FEATURES.accounts ? "auth" : "title");
  };

  const handleDeleteAccount = async () => {
    const auth = getAuth();
    if (auth) {
      try {
        await apiFetch('/api/auth/account', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${auth.token}` },
        });
      } catch {}
    }
    setSaveHook(null);
    clearAuth();
    clearLocal();
    clearLocalEventRecords();
    setScreen(FEATURES.accounts ? "auth" : "title");
  };

  const goToMenu        = () => setScreen("menu");
  const goToStageSelect = (diff: Difficulty) => { setDiff(diff); setScreen("stage-select"); };
  const goToGame        = (s: StageDef)      => { setStage(s);   setScreen("game"); };
  const goToBossSelect  = () => setScreen("boss-select");
  const goToBossFight   = (bossId: string)   => { setBoss(bossId); setScreen("boss-fight"); };

  const goToOnlineGame  = (params: OnlineGameParams) => {
    setOnlineParams(params);
    setScreen("online-game");
  };

  const stats = computeEffectiveStats(load());

  return (
    <>
      {screen === "auth"  && <AuthPage onSuccess={handleAuthSuccess} />}
      {screen === "title" && <Home onStart={goToMenu} />}
      {screen === "menu"  && (
        <MainMenu
          username={username}
          onPlay={goToStageSelect}
          onHyaku={() => setScreen("hyaku")}
          onBoss={goToBossSelect}
          onOnline={() => setScreen("online-lobby")}
          onGacha={() => setScreen("gacha")}
          onCollection={() => setScreen("collection")}
          onLevelUp={() => setScreen("levelup")}
          onEquipGacha={() => setScreen("equip-gacha")}
          onEquipment={() => setScreen("equipment")}
          onLegendGacha={() => setScreen("legend-gacha")}
          onDefense={() => setScreen("defense")}
          onItemBox={() => setScreen("item-box")}
          onEvent={() => setScreen("event-hub")}
          onLogout={handleLogout}
          onNewGame={handleNewGame}
          onDeleteAccount={handleDeleteAccount}
        />
      )}
      {screen === "stage-select" && (
        <StageSelectPage difficulty={difficulty} onStart={goToGame} onBack={goToMenu} />
      )}
      {screen === "game"  && (
        <GamePage stats={stats} difficulty={difficulty} stage={stage} onBack={goToMenu} />
      )}
      {screen === "hyaku"       && <HyakuPage onBack={goToMenu} />}
      {screen === "boss-select" && (
        <BossSelectPage onSelect={goToBossFight} onBack={goToMenu} />
      )}
      {screen === "boss-fight"  && (
        <BossPage bossId={selectedBoss} onBack={goToBossSelect} />
      )}
      {screen === "gacha"       && <GachaPage      onBack={goToMenu} />}
      {screen === "collection"  && <CollectionPage onBack={goToMenu} />}
      {screen === "levelup"     && <LevelUpPage    onDone={goToMenu} />}
      {screen === "equip-gacha" && <EquipGachaPage onBack={goToMenu} />}
      {screen === "equipment"   && <EquipmentPage  onBack={goToMenu} />}
      {screen === "legend-gacha" && <LegendGachaPage onBack={goToMenu} />}
      {screen === "defense"      && <DefenseBattlePage onBack={goToMenu} />}
      {screen === "item-box"    && <ItemBoxPage onBack={goToMenu} />}
      {screen === "event-hub"   && (
        <LimitedEventPage onBack={goToMenu} onEvent={(id) => {
          if (id === 'survival')       setScreen('event-survival');
          if (id === 'shinigami-dps')  setScreen('event-shinigami');
          if (id === 'strongest')      setScreen('event-strongest');
          if (id === 'raid')           setScreen('event-raid');
          if (id === 'theme')          setScreen('event-theme');
          if (id === 'gunner-master')  setScreen('event-gunner');
        }} />
      )}
      {screen === "event-survival"  && <EventSurvivalPage   onBack={() => setScreen('event-hub')} />}
      {screen === "event-shinigami" && <EventShinigamiPage  onBack={() => setScreen('event-hub')} />}
      {screen === "event-strongest" && <EventStrongestPage  onBack={() => setScreen('event-hub')} />}
      {screen === "event-raid"      && <EventRaidPage       onBack={() => setScreen('event-hub')} />}
      {screen === "event-theme"     && <EventThemePage      onBack={() => setScreen('event-hub')} />}
      {screen === "event-gunner"    && <GunnerMasterPage    onBack={() => setScreen('event-hub')} />}
      {screen === "online-lobby" && (
        <OnlineLobbyPage onGameStart={goToOnlineGame} onBack={goToMenu} />
      )}
      {screen === "online-game" && onlineParams && (
        <OnlineGamePage
          role={onlineParams.role}
          myStats={onlineParams.myStats}
          opponentStats={onlineParams.opponentStats}
          stage={onlineParams.stage}
          transport={onlineParams.transport}
          onBack={goToMenu}
        />
      )}
    </>
  );
}
