import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { saveSyllabus } from "./actions";

export default async function SyllabusesPage({ searchParams }: { searchParams: { subjectId?: string } }) {
  const subjects = await prisma.subject.findMany({
    include: { faculty: true, syllabus: true },
    orderBy: { name: "asc" },
  });

  const selectedId = searchParams.subjectId ?? subjects[0]?.id;
  const selected = subjects.find((s) => s.id === selectedId);

  return (
    <div>
      <p className="label-eyebrow mb-2">Program studiów</p>
      <h1 className="font-display text-3xl mb-8">Podstawa programowa</h1>

      <div className="grid grid-cols-[280px_1fr] gap-8">
        <div className="flex flex-col gap-1">
          {subjects.map((s) => (
            <Link
              key={s.id}
              href={`/syllabuses?subjectId=${s.id}`}
              className={`px-3 py-2 rounded text-sm flex justify-between ${
                s.id === selectedId ? "bg-panel text-brass" : "text-parchment/70 hover:bg-panel"
              }`}
            >
              <span>{s.name}</span>
              {!s.syllabus && <span className="text-parchment/30 text-xs">pusty</span>}
            </Link>
          ))}
          {subjects.length === 0 && (
            <p className="text-parchment/40 text-sm">Brak przedmiotów — dodaj je w zakładce Egzaminy.</p>
          )}
        </div>

        <div>
          {!selected ? (
            <p className="text-parchment/40">Wybierz przedmiot.</p>
          ) : (
            <form action={saveSyllabus} className="flex flex-col gap-3">
              <input type="hidden" name="subjectId" value={selected.id} />
              <h2 className="font-display text-xl">{selected.name} <span className="text-parchment/40 text-base">— {selected.faculty?.name}</span></h2>
              <textarea
                name="content"
                rows={20}
                defaultValue={selected.syllabus?.content ?? ""}
                placeholder="Treść sylabusu (obsługiwany markdown — wyświetlany studentom przez /sylabus)"
                className="font-mono text-sm"
              />
              <button type="submit" className="btn-primary self-start">Zapisz sylabus</button>
              {selected.syllabus && (
                <p className="text-xs text-parchment/40">
                  Ostatnia aktualizacja: {selected.syllabus.updatedAt.toLocaleString("pl-PL")}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
