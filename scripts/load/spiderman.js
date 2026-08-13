import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000/api";
const GAME = __ENV.GAME || "cards";
const EVENT_PIN = __ENV.EVENT_PIN || "";
const ACCESS_PREFIX = __ENV.ACCESS_PREFIX || "load";

export const options = {
  scenarios: {
    main: {
      executor: "ramping-vus",
      stages: [
        { duration: "20s", target: 100 },
        { duration: "20s", target: 250 },
        { duration: "20s", target: 500 },
        { duration: "20s", target: 750 },
        { duration: "20s", target: 1000 },
        { duration: "20s", target: 1000 },
      ],
      exec: "defaultFlow",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300"],
  },
};

let cookie = "";
let logged = 0;

const jsonHeaders = { "content-type": "application/json" };

function note(name, res) {
  if (res.status >= 200 && res.status < 300) return;
  if (logged >= 20) return;
  logged += 1;
  console.log(
    `${name} status=${res.status} body=${String(res.body).slice(0, 140)}`,
  );
}

function login(vu) {
  const res = http.post(
    `${BASE_URL}/auth/player/login`,
    JSON.stringify({ accessCode: `${ACCESS_PREFIX}-${vu}`, pin: EVENT_PIN }),
    { headers: jsonHeaders },
  );
  note("login", res);
  if (res.status !== 200) {
    return false;
  }
  const ck = res.cookies["spm_access_token"];
  if (ck && ck.length) {
    cookie = `spm_access_token=${ck[0].value}`;
    return true;
  }
  return false;
}

const vu = String(__VU).padStart(4, "0");
const gameHeaders = { "content-type": "application/json", cookie };

function cardsFlow() {
  if (__ITER === 0) {
    const start = http.post(`${BASE_URL}/games/cards/start`, "{}", {
      headers: gameHeaders,
    });
    check(start, { "cards start 201": (r) => r.status === 201 });
    note("cards/start", start);
    cardIds = (start.json().cards || []).map((c) => c.id);
  }
  if (cardIds.length && __ITER < 100) {
    const move = http.post(
      `${BASE_URL}/games/cards/move`,
      JSON.stringify({
        cardId: cardIds[__ITER],
        clientActionId: `lt-${vu}-m${__ITER}`,
      }),
      { headers: gameHeaders },
    );
    check(move, { "cards move 201": (r) => r.status === 201 });
    note("cards/move", move);
  }
}

let cardIds = [];

function wordleFlow() {
  if (__ITER === 0) {
    const start = http.post(`${BASE_URL}/games/wordle/start`, "{}", {
      headers: gameHeaders,
    });
    check(start, { "wordle start 201": (r) => r.status === 201 });
    note("wordle/start", start);
  }
  if (__ITER >= 1 && __ITER <= 6) {
    const guess = http.post(
      `${BASE_URL}/games/wordle/guess`,
      JSON.stringify({
        guess: "tried",
        clientActionId: `lt-${vu}-g${__ITER}`,
      }),
      { headers: gameHeaders },
    );
    check(guess, { "wordle guess 200": (r) => r.status === 200 });
    note("wordle/guess", guess);
  }
}

let shadowQuestions = [];

function shadowFlow() {
  if (__ITER === 0) {
    const start = http.post(`${BASE_URL}/games/shadow/start`, "{}", {
      headers: gameHeaders,
    });
    check(start, { "shadow start 201": (r) => r.status === 201 });
    note("shadow/start", start);
    shadowQuestions = start.json().questions || [];
  }
  const q = shadowQuestions[__ITER - 1];
  if (__ITER >= 1 && __ITER <= 6 && q) {
    const answer = http.post(
      `${BASE_URL}/games/shadow/answer`,
      JSON.stringify({
        questionId: q.id,
        answer: q.options[0],
        clientActionId: `lt-${vu}-a${__ITER}`,
      }),
      { headers: gameHeaders },
    );
    check(answer, { "shadow answer 200": (r) => r.status === 200 });
    note("shadow/answer", answer);
  }
}

function leaderboardFlow() {
  const top = http.get(`${BASE_URL}/leaderboard?limit=50`);
  check(top, { "leaderboard 200": (r) => r.status === 200 });
  note("leaderboard", top);
  const me = http.get(`${BASE_URL}/leaderboard/me`, { headers: gameHeaders });
  check(me, { "leaderboard/me 200": (r) => r.status === 200 });
  note("leaderboard/me", me);
}

export function setup() {
  const probe = http.post(
    `${BASE_URL}/auth/player/login`,
    JSON.stringify({ accessCode: `${ACCESS_PREFIX}-1`, pin: EVENT_PIN }),
    { headers: jsonHeaders },
  );
  if (probe.status !== 200) {
    throw new Error(`setup login failed: ${probe.status}`);
  }
}

export function defaultFlow() {
  if (!cookie && !login(__VU)) {
    check(null, { "login ok": () => false });
    return;
  }
  if (GAME === "cards") cardsFlow();
  else if (GAME === "wordle") wordleFlow();
  else if (GAME === "shadow") shadowFlow();
  else if (GAME === "leaderboard") leaderboardFlow();
  else throw new Error(`unknown GAME=${GAME}`);
  sleep(1);
}
