"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

type Mode = "signin" | "signup";

export default function AuthPanel({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  // 로그인에서는 이름 또는 이메일을 모두 받는다.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  // 관리자가 되려면 실제 이메일이 필요하다. 그 외에는 비워둔다.
  const [email, setEmail] = useState("");
  const [wantAdmin, setWantAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      if (!identifier.trim() || !password) {
        setError("이름과 비밀번호를 입력해 주세요.");
        return;
      }
      setBusy(true);
      const message = await signIn(identifier, password);
      setBusy(false);
      if (message) { setError(message); return; }
      onClose();
      return;
    }

    // 회원가입
    if (!displayName.trim() || !password) {
      setError("이름과 비밀번호를 입력해 주세요.");
      return;
    }
    if (wantAdmin && !email.trim()) {
      setError("관리자용으로 가입하려면 이메일을 입력해 주세요.");
      return;
    }
    setBusy(true);
    const message = await signUp(displayName, password, wantAdmin ? email : undefined);
    setBusy(false);
    if (message) { setError(message); return; }

    setNotice(
      "가입이 완료되었습니다. 처음에는 '열람자'이며, 관리자가 편집 권한을 부여합니다."
    );
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{mode === "signin" ? "로그인" : "회원가입"}</h3>
        <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
          로그인하지 않아도 맛집을 둘러볼 수 있습니다. 로그인하면 나만의 즐겨찾기를 쓸 수 있어요.
        </p>

        {mode === "signin" ? (
          <div className="field">
            <label>이름</label>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="가입할 때 정한 이름"
              autoComplete="username"
            />
            <p className="hint">이메일로 가입하셨다면 이메일 주소를 넣으세요.</p>
          </div>
        ) : (
          <div className="field">
            <label>이름</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="예: 아빠, 시환"
              autoComplete="username"
            />
            <p className="hint">이 이름으로 로그인하고, 등록한 맛집에도 이 이름이 표시됩니다.</p>
          </div>
        )}

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

        {mode === "signup" && (
          <div className="field">
            <label className="check-line">
              <input
                type="checkbox"
                checked={wantAdmin}
                onChange={(e) => setWantAdmin(e.target.checked)}
              />
              <span>관리자용으로 가입 (이메일 필요)</span>
            </label>
            {wantAdmin && (
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ marginTop: 6 }}
              />
            )}
            <p className="hint">
              관리자 권한은 실제 이메일로 가입한 계정에만 줄 수 있습니다.
              가족·친구가 쓸 계정이라면 체크하지 않아도 됩니다.
            </p>
          </div>
        )}

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
