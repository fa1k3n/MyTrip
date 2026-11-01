// The card "Användare" under the gear on Drömmar, for the superuser alone (US-02..US-04, US-12, US-16).
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type SetupLink, type UserInfo } from "./api.ts";
import { setupUrl } from "./access.ts";
import { IconButton } from "./Icons.tsx";
import { QrDialog } from "./QrDialog.tsx";
import { ask } from "./Ask.tsx"; // UI-11
import { sv } from "./sv.ts";
import { svAdmin } from "./sv-admin.ts";

const day = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
const how = (u: UserInfo) => svAdmin.users.how[u.password && u.google ? "both" : u.password ? "password" : u.google ? "google" : "none"];

export function Users() {
  const [users, setUsers] = useState<UserInfo[] | null>(null);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [err, setErr] = useState("");
  const [link, setLink] = useState<{ user: UserInfo; setup: SetupLink } | null>(null), [copied, setCopied] = useState(false), [qr, setQr] = useState(false);
  const load = () => api.users().then(setUsers, () => setUsers([]));
  useEffect(() => { load(); }, []);
  const add = async (e?: FormEvent) => {
    e?.preventDefault();
    try {
      const r = await api.addUser(name, email);
      setName(""); setEmail(""); setErr(""); setLink(r); setCopied(false);
      load();
    } catch (x) { setErr(x instanceof ApiError && x.status === 409 ? svAdmin.users.taken : svAdmin.users.bad); }
  };
  const change = async (u: UserInfo, patch: Parameters<typeof api.changeUser>[1]) => {
    try { await api.changeUser(u.id, patch); setErr(""); load(); } catch { setErr(svAdmin.users.self); }
  };
  const renew = async (u: UserInfo) => {
    if (u.password && !(await ask(svAdmin.users.confirmLink, { ok: sv.askOk.replace }))) return;
    setLink({ user: u, setup: await api.newSetup(u.id) }); setCopied(false);
  };
  const remove = async (u: UserInfo) => {
    if (!(await ask(svAdmin.users.confirmRemove(u.name)))) return;
    try { await api.removeUser(u.id); setErr(""); if (link?.user.id === u.id) setLink(null); load(); } catch { setErr(svAdmin.users.self); }
  };
  const url = link && setupUrl(location.origin, link.user.id, link.setup.secret);
  const copy = async () => { try { await navigator.clipboard.writeText(url!); setCopied(true); } catch { /* no clipboard */ } };
  return <div className="card users">
    <h3>{svAdmin.users.title}</h3>
    <p className="ro note">{svAdmin.users.hint}</p>
    {users?.map((u) => (
      <div className={`row mid${u.disabled ? " off" : ""}`} key={u.id}>
        <span><b>{u.name}</b> <span className="ro">{u.email}</span><br />
          <small className="ro">{how(u)}{u.lastLogin ? `, ${svAdmin.users.last(day(u.lastLogin))}` : ""}</small></span>
        <span className="end">
          <IconButton icon="crown" look="bare" tip="left" pressed={u.superuser} label={svAdmin.users.superuser(u.name)} onClick={() => change(u, { superuser: !u.superuser })} />
          <IconButton icon="sparkle" look="bare" tip="left" pressed={u.ai || u.superuser} disabled={u.superuser} label={svAdmin.users.ai(u.name)} onClick={() => change(u, { ai: !u.ai })} />
          <IconButton icon="userx" look="bare" tip="left" pressed={u.disabled} label={svAdmin.users.disabled(u.name)} onClick={() => change(u, { disabled: !u.disabled })} />
          <IconButton icon="link" look="bare" tip="left" label={svAdmin.users.newLink(u.name)} onClick={() => renew(u)} />
          <IconButton icon="trash" look="bare" tip="left" label={svAdmin.users.remove(u.name)} onClick={() => remove(u)} />
        </span>
      </div>
    ))}
    {link && url && <div className="setuplink" role="status">
      <p>{svAdmin.users.link(link.user.name)} <span className="ro">{svAdmin.users.expires(day(link.setup.expires))}</span></p>
      <span className="end">
        <IconButton icon="qr" look="bare" tip="left" label={svAdmin.qr.show(link.user.name)} onClick={() => setQr(true)} />
        <IconButton icon="copy" look="bare" tip="left" label={svAdmin.users.copy(link.user.name)} onClick={copy} />
      </span>
      {copied && <p className="ro">{svAdmin.users.copied}</p>}
    </div>}
    <form className="adduser" onSubmit={add}>
      <label>{svAdmin.users.name}<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
      <label>{svAdmin.users.email}<input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
      <IconButton icon="plus" label={svAdmin.users.add} tip="right" disabled={!name.trim() || !email.trim()} onClick={() => add()} />
    </form>
    {err && <p className="err" role="alert">{err}</p>}
    {qr && url && link && <QrDialog url={url} name={link.user.name} close={() => setQr(false)} />}
  </div>;
}
