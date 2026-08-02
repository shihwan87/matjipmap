"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "signup";

export default function AuthPanel({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    const message =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, displayName);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    if (mode === "signup") {
      // 이메일 인증이 켜져 있으면 메일 확인이 필요하고, 꺼져 있으면 바로 로그인된다.
      setNotice("가입이 완료되었습니다. 처음에는 '열람자'이며, 관리자가 편집 권한을 부여합니다.");
      return;
    }
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{mode === "signin" ? "로그인" : "회원가입"}</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          로그인하지 않아도 맛집을 둘러볼 수 있습니다. 로그인하면 나만의 즐겨찾기를 쓸 수 있어요.
        </p>

        {mode === "signup" && (
          <div className="field">
            <label>표시 이름</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="예: 아빠, 시환"
            />
          </div>
        )}

        <div className="field">
          <label>이메일</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="field">
          <label>비밀번호 {mode === "signup" && <span style={{ color: "#a99f8c" }}>(6자 이상)</span>}</label>
          <input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        {error && <p className="form-error">{error}</p>}
        {notice && <p className="form-notice">{notice}</p>}

        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "처리 중..." : mode === "signin" ? "로그인" : "가입하기"}
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
        >
          {mode === "signin" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
        </button>
        <button className="btn-ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
