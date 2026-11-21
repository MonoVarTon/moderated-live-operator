import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock3,
  Eye,
  ImagePlus,
  LockKeyhole,
  MessageCircle,
  Mic,
  Moon,
  Play,
  Radio,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { LIVE_FIXTURES, type LiveFixtureId } from "@shared/liveFixtures";

type TechLog = {
  time: string;
  durationMs: number;
  state: string;
  errorCode: string;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const errorCopy: Record<string, string> = {
  UNSUPPORTED_FIXTURE: "Этот тест не разрешён для AI-черновика.",
  RATE_LIMITED: "Пауза между тестовыми запросами ещё не закончилась.",
  CANCELLED: "Черновик отменён оператором. Текст не создан.",
  MODEL_TIMEOUT: "Операция завершилась по тайм-ауту. Безопасное состояние: молчание.",
  MODEL_UNAVAILABLE: "Источник черновика временно недоступен. Текст не создан.",
  MODEL_EMPTY: "Источник вернул пустой результат. Черновик не создан.",
  DRAFT_REJECTED: "Результат не прошёл проверку. Он не показан и не озвучен.",
  REQUEST_FAILED: "Не удалось выполнить тестовый запрос. Ничего не одобрено.",
};

function currentTime() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function Home() {
  const [selectedFixtureId, setSelectedFixtureId] = useState<LiveFixtureId>(
    LIVE_FIXTURES[0].id,
  );
  const [draftText, setDraftText] = useState("");
  const [approvedText, setApprovedText] = useState("");
  const [subtitleText, setSubtitleText] = useState("");
  const [draftState, setDraftState] = useState("Черновик ещё не запрашивался");
  const [voiceMuted, setVoiceMuted] = useState(true);
  const [emergencyStopped, setEmergencyStopped] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [wasPlayed, setWasPlayed] = useState(false);
  const [localVoices, setLocalVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState(
    "Изображение остаётся в этой вкладке и не отправляется на сервер или в AI.",
  );
  const [logs, setLogs] = useState<TechLog[]>([]);
  const generationEpoch = useRef(0);
  const activeDraftRequestId = useRef<string | null>(null);
  const playbackEpoch = useRef(0);
  const activePlaybackStartedAt = useRef<number | null>(null);
  const imageObjectUrl = useRef<string | null>(null);
  const subtitleTimer = useRef<number | undefined>(undefined);

  const selectedFixture =
    LIVE_FIXTURES.find(fixture => fixture.id === selectedFixtureId) ??
    LIVE_FIXTURES[0];
  const draftModeQuery = trpc.live.mode.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const draftMode = draftModeQuery.data;
  const isOfflineDemo = draftMode === "offline-demo";
  const draftMutation = trpc.live.draft.useMutation();
  const cancelDraftMutation = trpc.live.cancelDraft.useMutation();
  const requestPending = draftMutation.isPending && !emergencyStopped;

  const addLog = (state: string, durationMs = 0, errorCode = "—") => {
    setLogs(current =>
      [
        {
          time: currentTime(),
          durationMs: Math.max(0, Math.round(durationMs)),
          state,
          errorCode,
        },
        ...current,
      ].slice(0, 6),
    );
  };

  const cancelCurrentDraft = () => {
    const requestId = activeDraftRequestId.current;
    if (!requestId) return;
    activeDraftRequestId.current = null;
    cancelDraftMutation.mutate(
      { requestId },
      { onError: () => addLog("DRAFT_CANCEL_FAILED", 0, "CANCEL_FAILED") },
    );
  };

  const invalidatePendingDraft = () => {
    generationEpoch.current += 1;
    setDraftText("");
    setApprovedText("");
    setDraftState("Черновик отменён оператором");
    setWasPlayed(false);
    setSubtitleText("");
  };

  const handleSelectFixture = (fixtureId: LiveFixtureId) => {
    if (fixtureId === selectedFixtureId) return;
    generationEpoch.current += 1;
    cancelCurrentDraft();
    setSelectedFixtureId(fixtureId);
    setDraftText("");
    setApprovedText("");
    setSubtitleText("");
    setDraftState("Выбран новый тест; старый черновик очищен");
    setWasPlayed(false);
    addLog("TEST_SELECTED");
  };

  const handleGenerateDraft = () => {
    if (
      !draftMode ||
      !selectedFixture.aiEligible ||
      emergencyStopped ||
      requestPending
    ) return;
    generationEpoch.current += 1;
    const requestEpoch = generationEpoch.current;
    const requestId = crypto.randomUUID();
    activeDraftRequestId.current = requestId;
    const startedAt = performance.now();
    setDraftText("");
    setApprovedText("");
    setSubtitleText("");
    setWasPlayed(false);
    setDraftState(
      isOfflineDemo
        ? "Запрос отправлен вручную · локальный синтетический ответ"
        : "Запрос отправлен вручную · ожидаю ответ провайдера",
    );
    addLog("DRAFT_REQUESTED");

    draftMutation.mutate(
      { fixtureId: selectedFixture.id, requestId },
      {
        onSuccess: result => {
          const durationMs = performance.now() - startedAt;
          if (activeDraftRequestId.current === requestId) {
            activeDraftRequestId.current = null;
          }
          if (requestEpoch !== generationEpoch.current) return;
          if (emergencyStopped) return;
          if (result.ok) {
            setDraftText(result.text);
            const source =
              result.model === "offline-demo"
                ? "offline-demo"
                : `источник ${result.model}`;
            setDraftState(`Черновик готов · ${source} · требуется проверка`);
            addLog("DRAFT_READY", durationMs);
          } else {
            setDraftText("");
            setDraftState(errorCopy[result.code] ?? errorCopy.MODEL_UNAVAILABLE);
            addLog("DRAFT_FAILED", durationMs, result.code);
          }
        },
        onError: () => {
          const durationMs = performance.now() - startedAt;
          if (activeDraftRequestId.current === requestId) {
            activeDraftRequestId.current = null;
          }
          if (requestEpoch !== generationEpoch.current) return;
          setDraftText("");
          setDraftState(errorCopy.REQUEST_FAILED);
          addLog("DRAFT_FAILED", durationMs, "REQUEST_FAILED");
        },
      },
    );
  };

  const handleApproveDraft = () => {
    const approved = draftText.trim();
    if (!approved || emergencyStopped) return;
    setApprovedText(approved);
    setSubtitleText(approved);
    setDraftState("Одобрено оператором · озвучивание не запускалось");
    setWasPlayed(false);
    addLog("DRAFT_APPROVED");
  };

  const handleCancelDraft = () => {
    generationEpoch.current += 1;
    cancelCurrentDraft();
    if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
      playbackEpoch.current += 1;
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      activePlaybackStartedAt.current = null;
    }
    setDraftText("");
    setApprovedText("");
    setSubtitleText("");
    setDraftState("Черновик отменён оператором");
    setWasPlayed(false);
    addLog("DRAFT_CANCELED");
  };

  const stopSpeech = () => {
    playbackEpoch.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const startedAt = activePlaybackStartedAt.current;
    setIsSpeaking(false);
    activePlaybackStartedAt.current = null;
    if (subtitleTimer.current) window.clearTimeout(subtitleTimer.current);
    setSubtitleText("");
    addLog("VOICE_STOPPED", startedAt ? performance.now() - startedAt : 0);
  };

  const handleMuteToggle = () => {
    if (emergencyStopped) return;
    if (!voiceMuted) {
      stopSpeech();
      setVoiceMuted(true);
      addLog("VOICE_MUTED");
      return;
    }
    setVoiceMuted(false);
    addLog("VOICE_UNMUTED");
  };

  const handleEmergencyStop = () => {
    generationEpoch.current += 1;
    cancelCurrentDraft();
    playbackEpoch.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (subtitleTimer.current) window.clearTimeout(subtitleTimer.current);
    setEmergencyStopped(true);
    setVoiceMuted(true);
    setIsSpeaking(false);
    activePlaybackStartedAt.current = null;
    setDraftText("");
    setApprovedText("");
    setSubtitleText("");
    setDraftState("Аварийная остановка · речь заблокирована до ручного сброса");
    setWasPlayed(false);
    addLog("EMERGENCY_STOP");
  };

  const handleResetEmergency = () => {
    generationEpoch.current += 1;
    setEmergencyStopped(false);
    setVoiceMuted(true);
    setDraftText("");
    setApprovedText("");
    setSubtitleText("");
    setDraftState("Стоп снят вручную · голос остаётся в VOICE_MUTED");
    setWasPlayed(false);
    addLog("EMERGENCY_RESET");
  };

  const handlePlayApproved = () => {
    if (emergencyStopped || voiceMuted || !approvedText || isSpeaking) return;
    if (!("speechSynthesis" in window)) {
      setDraftState("Синтез речи недоступен в этом браузере");
      addLog("VOICE_UNAVAILABLE", 0, "TTS_UNAVAILABLE");
      return;
    }
    const voice = localVoices.find(candidate => candidate.voiceURI === selectedVoiceURI);
    if (!voice || !voice.localService) {
      setDraftState("Локальный системный голос не выбран; речь заблокирована");
      addLog("VOICE_UNAVAILABLE", 0, "LOCAL_VOICE_UNAVAILABLE");
      return;
    }

    const utterance = new SpeechSynthesisUtterance(approvedText);
    utterance.voice = voice;
    utterance.lang = voice.lang || "ru-RU";
    utterance.rate = 0.96;
    utterance.pitch = 1;
    const requestEpoch = ++playbackEpoch.current;
    const startedAt = performance.now();
    activePlaybackStartedAt.current = startedAt;
    setSubtitleText(approvedText);
    setIsSpeaking(true);
    setDraftState("Локальная тестовая речь воспроизводится");
    addLog("VOICE_STARTED");

    utterance.onend = () => {
      if (requestEpoch !== playbackEpoch.current) return;
      setIsSpeaking(false);
      setWasPlayed(true);
      activePlaybackStartedAt.current = null;
      setDraftState("Воспроизведение завершено · повтор только вручную");
      addLog("VOICE_FINISHED", performance.now() - startedAt);
      subtitleTimer.current = window.setTimeout(() => setSubtitleText(""), 1_800);
    };
    utterance.onerror = () => {
      if (requestEpoch !== playbackEpoch.current) return;
      setIsSpeaking(false);
      activePlaybackStartedAt.current = null;
      setDraftState("Синтез речи завершился ошибкой · голос остановлен");
      setSubtitleText("");
      addLog("VOICE_FAILED", performance.now() - startedAt, "TTS_ERROR");
    };
    window.speechSynthesis.speak(utterance);
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageMessage("Выберите файл изображения; другие типы не принимаются.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageMessage("Лимит локального предпросмотра — 8 МБ. Файл не загружен.");
      return;
    }
    if (imageObjectUrl.current) URL.revokeObjectURL(imageObjectUrl.current);
    const objectUrl = URL.createObjectURL(file);
    imageObjectUrl.current = objectUrl;
    setImageUrl(objectUrl);
    setImageMessage("Изображение показано только в этой вкладке; загрузки на сервер нет.");
  };

  const clearImage = () => {
    if (imageObjectUrl.current) URL.revokeObjectURL(imageObjectUrl.current);
    imageObjectUrl.current = null;
    setImageUrl(null);
    setImageMessage("Нейтральная сцена восстановлена. Никакие изображения не хранятся.");
  };

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refreshVoices = () => {
      const available = synth.getVoices().filter(voice => voice.localService);
      setLocalVoices(available);
      setSelectedVoiceURI(current =>
        available.some(voice => voice.voiceURI === current)
          ? current
          : (available[0]?.voiceURI ?? ""),
      );
    };
    refreshVoices();
    synth.addEventListener("voiceschanged", refreshVoices);
    return () => synth.removeEventListener("voiceschanged", refreshVoices);
  }, []);

  useEffect(
    () => () => {
      generationEpoch.current += 1;
      playbackEpoch.current += 1;
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (imageObjectUrl.current) URL.revokeObjectURL(imageObjectUrl.current);
      if (subtitleTimer.current) window.clearTimeout(subtitleTimer.current);
    },
    [],
  );

  return (
    <main className="control-room">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol" aria-hidden="true">
            <Moon size={19} strokeWidth={1.8} />
          </div>
          <div>
            <div className="brand-name">LIVE OPERATOR DEMO</div>
            <div className="brand-subtitle">операторская сцены · серия 01</div>
          </div>
        </div>
        <div className="topbar-status">
          <span className="demo-badge"><span className="status-dot" /> ТЕСТОВАЯ СРЕДА</span>
          <span className="offline-badge"><Radio size={14} /> LIVE не подключён</span>
        </div>
      </header>

      <section className="intro-row">
        <div>
          <p className="eyebrow">ПУЛЬТ МОДЕРАЦИИ / ПРЕДПРОСМОТР</p>
          <h1>Демо-сцена <span>— сцена-прототип</span></h1>
          <p className="intro-copy">
            Только вымышленные тесты из матрицы. Реальные чаты и внешние интеграции не подключены.
          </p>
        </div>
        <div className="model-note">
          <Sparkles size={15} />
          <span>
            {isOfflineDemo
              ? "OFFLINE DEMO · фиксированные ответы"
              : draftMode === "provider"
                ? "Внешний AI provider"
                : "Режим не подтверждён"}
          </span>
          <span className="model-note-sub">
            {isOfflineDemo
              ? "Без сетевого вызова и расхода model credits"
              : draftMode === "provider"
                ? "Ручной запрос отправит тестовую фикстуру настроенному провайдеру"
                : "Создание черновиков заблокировано до проверки режима"}
          </span>
        </div>
      </section>

      <section className="workspace-grid" aria-label="Операторская панель тестовой сцены">
        <div className="scene-column">
          <section className="panel scene-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">01 / СЦЕНА</p>
                <h2>Предпросмотр эфира</h2>
              </div>
              <span className="scene-state"><span className="status-dot" /> OFFLINE</span>
            </div>

            <div className="scene-stage">
              <div className="stage-sky" aria-hidden="true">
                <i className="star star-a" /><i className="star star-b" /><i className="star star-c" />
                <i className="star star-d" /><i className="star star-e" /><i className="star star-f" />
              </div>
              <div className="stage-label"><Eye size={13} /> ПРЕДПРОСМОТР · ТОЛЬКО ЭТОТ БРАУЗЕР</div>
              <div className="orbit orbit-one" aria-hidden="true" />
              <div className="orbit orbit-two" aria-hidden="true" />
              {imageUrl ? (
                <div className="local-art-frame">
                  <img src={imageUrl} alt="Локальный предпросмотр выбранного изображения" />
                  <span className="local-art-tag"><LockKeyhole size={12} /> ЛОКАЛЬНЫЙ ФАЙЛ</span>
                </div>
              ) : (
                <div className="demo-orb" aria-label="Нейтральная декоративная сцена">
                  <div className="demo-orb-halo" />
                  <div className="demo-orb-disc"><span /><i /><b /></div>
                  <div className="demo-orbit-dot" />
                </div>
              )}
              <div className="scene-caption">
                <span className="scene-kicker">LIVE OPERATOR DEMO · 01</span>
                <strong>Демо-сцена</strong>
                <span>Художественная карточка персонажа пока не загружена</span>
              </div>
              {subtitleText && (
                <div className="scene-subtitle" aria-live="polite">{subtitleText}</div>
              )}
              {emergencyStopped && (
                <div className="emergency-overlay"><AlertTriangle size={15} /> АВАРИЙНАЯ ОСТАНОВКА</div>
              )}
              {isSpeaking && <div className="speaking-indicator"><span /> ЛОКАЛЬНАЯ РЕЧЬ</div>}
            </div>

            <div className="scene-meta-row">
              <div className="meta-card">
                <span className="meta-icon"><ShieldCheck size={16} /></span>
                <div><strong>Черновик ответа</strong><small>Не имитирует реальных людей</small></div>
              </div>
              <div className="meta-card">
                <span className="meta-icon"><ImagePlus size={16} /></span>
                <div><strong>Источник сцены</strong><small>{imageUrl ? "локальный файл · не загружен" : "нейтральный фон"}</small></div>
              </div>
              <div className="meta-card">
                <span className="meta-icon"><Activity size={16} /></span>
                <div><strong>Состояние</strong><small>ручная модерация включена</small></div>
              </div>
            </div>
          </section>

          <section className="panel local-panel">
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">02 / ЛОКАЛЬНЫЕ ИСТОЧНИКИ</p>
                <h2>Изображение и голос</h2>
              </div>
              <span className="local-only-badge"><LockKeyhole size={12} /> БЕЗ ЗАГРУЗКИ</span>
            </div>
            <div className="local-controls">
              <div className="upload-control">
                <label className="file-button" htmlFor="scene-image">
                  <ImagePlus size={16} /> Выбрать изображение
                </label>
                <input id="scene-image" type="file" accept="image/*" onChange={handleImageChange} />
                {imageUrl && <button className="text-button" onClick={clearImage} type="button">Убрать</button>}
                <p className="microcopy">Лимит 8 МБ · остаётся в памяти этой вкладки · при перезагрузке исчезнет</p>
                <p className="microcopy image-message" aria-live="polite">{imageMessage}</p>
              </div>
              <div className="voice-control">
                <div className="voice-label"><Mic size={15} /><span>Браузерный голос</span></div>
                <select
                  value={selectedVoiceURI}
                  onChange={event => setSelectedVoiceURI(event.target.value)}
                  disabled={localVoices.length === 0 || emergencyStopped}
                  aria-label="Выбрать локальный системный голос"
                >
                  {localVoices.length === 0 ? (
                    <option value="">Локальных голосов не найдено</option>
                  ) : localVoices.map(voice => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} · {voice.lang}
                    </option>
                  ))}
                </select>
                <p className="microcopy">Показываются только голоса, помеченные браузером как локальные. Клона и внешнего TTS нет.</p>
              </div>
            </div>
          </section>

          <section className="panel tech-log-panel">
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">03 / ТЕХНИЧЕСКИЙ СЛЕД</p>
                <h2>События этой вкладки</h2>
              </div>
              <span className="ephemeral-pill"><Clock3 size={13} /> НЕ СОХРАНЯЕТСЯ</span>
            </div>
            <p className="microcopy log-note">Только время, длительность, состояние и код ошибки. Реплики и AI-тексты сюда не попадают.</p>
            <div className="log-table" role="table" aria-label="Непостоянный технический журнал">
              <div className="log-row log-header" role="row"><span>Время</span><span>мс</span><span>Состояние</span><span>Код</span></div>
              {logs.length === 0 ? (
                <div className="empty-log">Пока нет событий этой сессии.</div>
              ) : logs.map((entry, index) => (
                <div className="log-row" role="row" key={`${entry.time}-${entry.state}-${index}`}>
                  <span>{entry.time}</span><span>{entry.durationMs}</span><span>{entry.state}</span><span>{entry.errorCode}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="moderation-column">
          <section className="panel queue-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">04 / ТЕСТОВАЯ ОЧЕРЕДЬ</p>
                <h2>Реплики из матрицы</h2>
              </div>
              <span className="queue-count">{LIVE_FIXTURES.length} теста</span>
            </div>
            <p className="microcopy queue-note">Выбор кейса ничего не отправляет. В offline-demo черновики фиксированы и локальны; доступны только T01–T03.</p>
            <div className="fixture-list">
              {LIVE_FIXTURES.map(fixture => (
                <button
                  className={`fixture-card ${selectedFixtureId === fixture.id ? "is-selected" : ""}`}
                  key={fixture.id}
                  onClick={() => handleSelectFixture(fixture.id)}
                  type="button"
                  aria-pressed={selectedFixtureId === fixture.id}
                >
                  <span className="fixture-topline"><span className="fixture-id">{fixture.id}</span><span className="fixture-access"><LockKeyhole size={11} /> DEMO TEST</span></span>
                  <span className="fixture-comment"><MessageCircle size={14} /> {fixture.comment}</span>
                  <span className="fixture-expectation">Ожидается: {fixture.expectedBehavior}</span>
                  {selectedFixtureId === fixture.id && <span className="fixture-selected"><Check size={12} /> ВЫБРАНО</span>}
                </button>
              ))}
            </div>
          </section>

          <section className="panel draft-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">05 / РУЧНАЯ МОДЕРАЦИЯ</p>
                <h2>Черновик ответа</h2>
              </div>
              <span className="review-required"><ShieldCheck size={13} /> ПРОВЕРИТЬ</span>
            </div>
            <div className={`draft-status ${draftMutation.isPending && !emergencyStopped ? "is-pending" : ""}`} aria-live="polite">
              {draftMutation.isPending && !emergencyStopped ? <span className="mini-loader" /> : <span className="status-dot" />}
              <span>{draftState}</span>
            </div>
            <button
              className="primary-button ai-button"
              type="button"
              disabled={!draftMode || !selectedFixture.aiEligible || emergencyStopped || draftMutation.isPending}
              onClick={handleGenerateDraft}
            >
              <Sparkles size={16} />
              {draftMutation.isPending && !emergencyStopped ? "Создаю черновик…" : "Создать черновик вручную"}
              <ArrowUpRight size={15} />
            </button>
            <label className="draft-label" htmlFor="draft-text">Текст на проверку</label>
            <textarea
              id="draft-text"
              value={draftText}
              onChange={event => setDraftText(event.target.value.slice(0, 220))}
              placeholder="После явного запроса ответ появится здесь. До approve он не будет показан в сцене или озвучен."
              maxLength={220}
              rows={4}
              disabled={emergencyStopped}
            />
            <div className="draft-actions">
              <button className="approve-button" type="button" onClick={handleApproveDraft} disabled={!draftText.trim() || emergencyStopped}>
                <Check size={15} /> Одобрить
              </button>
              <button className="text-button cancel-button" type="button" onClick={handleCancelDraft} disabled={!draftText && !approvedText && !draftMutation.isPending}>
                <X size={15} /> Отменить
              </button>
            </div>
            <div className="speech-actions">
              <div className="mute-row">
                <button
                  className={`mute-button ${voiceMuted ? "is-muted" : ""}`}
                  type="button"
                  aria-pressed={voiceMuted}
                  disabled={emergencyStopped}
                  onClick={handleMuteToggle}
                >
                  {voiceMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  {voiceMuted ? "VOICE_MUTED · ВКЛ" : "VOICE_MUTED · ВЫКЛ"}
                </button>
                <span className="no-autoplay">Нет автовоспроизведения</span>
              </div>
              <button
                className="play-button"
                type="button"
                disabled={!approvedText || voiceMuted || emergencyStopped || isSpeaking || localVoices.length === 0}
                onClick={handlePlayApproved}
              >
                {isSpeaking ? <Volume2 size={16} className="sound-pulse" /> : <Play size={15} />}
                {isSpeaking ? "Идёт тестовая речь" : wasPlayed ? "Повторить вручную" : "Озвучить одобренный текст"}
              </button>
              <p className="microcopy speech-note">Субтитры появляются после ручного approve. Голос запускается только отдельной кнопкой и только из локального voice.</p>
            </div>
          </section>

          <section className={`panel emergency-panel ${emergencyStopped ? "is-emergency" : ""}`}>
            <div className="panel-heading compact-heading">
              <div>
                <p className="eyebrow">06 / НЕЗАВИСИМЫЙ КОНТРОЛЬ</p>
                <h2>Аварийный стоп</h2>
              </div>
              <span className={`safety-status ${emergencyStopped ? "danger" : "safe"}`}>{emergencyStopped ? "ЗАБЛОКИРОВАНО" : "ГОТОВ"}</span>
            </div>
            {emergencyStopped ? (
              <>
                <p className="emergency-copy">Речь остановлена, субтитр и черновик очищены. Сброс не включает голос: после него останется VOICE_MUTED.</p>
                <button className="reset-button" onClick={handleResetEmergency} type="button"><RotateCcw size={15} /> Сбросить вручную</button>
              </>
            ) : (
              <>
                <p className="emergency-copy">Останавливает активную речь, очищает ожидающий текст и блокирует новые запросы речи до ручного сброса.</p>
                <button className="emergency-button" onClick={handleEmergencyStop} type="button"><AlertTriangle size={15} /> АВАРИЙНАЯ ОСТАНОВКА</button>
              </>
            )}
          </section>

          <div className="operator-note"><LockKeyhole size={14} /><span>Нет автоответов, TikTok API, записи чата, БД или публикации. Fail-closed: ошибка/тайм-аут = тишина.</span></div>
        </aside>
      </section>

      <footer className="bottom-bar">
        <div><span className="footer-mark"><Moon size={14} /></span><span>DEMO / PROTOTYPE 0.1</span></div>
        <span>Черновик ≠ одобрение · голос выключен по умолчанию · тесты не сохраняются</span>
        <span className="footer-live"><span className="status-dot" /> НЕ В ЭФИРЕ</span>
      </footer>
    </main>
  );
}
