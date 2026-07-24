"use client";

import { useState } from "react";
import { updateOption, deleteOption } from "./actions";

type Role = { id: string; name: string };
type Option = {
  id: string;
  label: string;
  discordRoleIds: string[];
  emoji: string | null;
  style: string;
  order: number;
};

const STYLES = ["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"];

export default function OptionRow({ option, roles, roleNameById }: { option: Option; roles: Role[]; roleNameById: Map<string, string> }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <tr>
        <td>{option.order}</td>
        <td>{option.label}</td>
        <td className="font-mono text-xs">{option.discordRoleIds.map((id) => roleNameById.get(id) ?? id).join(", ")}</td>
        <td>{option.emoji ?? "—"}</td>
        <td>{option.style}</td>
        <td className="flex gap-2">
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs">Edytuj</button>
          <form action={deleteOption}>
            <input type="hidden" name="id" value={option.id} />
            <button type="submit" className="btn-danger text-xs">Usuń</button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={6} className="py-3">
        <form
          action={async (formData) => {
            await updateOption(formData);
            setEditing(false);
          }}
          className="flex flex-wrap gap-3 items-end bg-panel p-3 rounded"
        >
          <input type="hidden" name="id" value={option.id} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Etykieta</label>
            <input name="label" defaultValue={option.label} required className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Role (Ctrl/Cmd + klik = wiele)</label>
            <select name="discordRoleIds" multiple required defaultValue={option.discordRoleIds} className="w-56 h-24">
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Emoji</label>
            <input name="emoji" defaultValue={option.emoji ?? ""} className="w-24" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Styl</label>
            <select name="style" defaultValue={option.style}>
              {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-parchment/50">Kolejność</label>
            <input name="order" type="number" defaultValue={option.order} className="w-20" />
          </div>
          <button type="submit" className="btn-primary text-xs">Zapisz</button>
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-xs">Anuluj</button>
        </form>
      </td>
    </tr>
  );
}
