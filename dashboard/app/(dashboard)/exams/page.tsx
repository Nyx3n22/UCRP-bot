import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { createSubject, addExamQuestion, deleteExamQuestion } from "./actions";

export default async function ExamsPage({ searchParams }: { searchParams: { subjectId?: string } }) {
  const [subjects, faculties] = await Promise.all([
    prisma.subject.findMany({ include: { faculty: true }, orderBy: { name: "asc" } }),
    prisma.faculty.findMany({ orderBy: { name: "asc" } }),
  ]);

  const selectedId = searchParams.subjectId ?? subjects[0]?.id;
  const selected = selectedId
    ? await prisma.subject.findUnique({
        where: { id: selectedId },
        include: { questions: { orderBy: { order: "asc" } } },
      })
    : null;

  return (
    <div>
      <p className="label-eyebrow mb-2">Egzaminy</p>
      <h1 className="font-display text-3xl mb-8">Interaktywny system egzaminacyjny</h1>

      <div className="grid grid-cols-[280px_1fr] gap-8">
        <div>
          <h2 className="font-display text-lg mb-3">Przedmioty</h2>
          <div className="flex flex-col gap-1 mb-6">
            {subjects.map((s) => (
              <Link
                key={s.id}
                href={`/exams?subjectId=${s.id}`}
                className={`px-3 py-2 rounded text-sm ${
                  s.id === selectedId ? "bg-panel text-brass" : "text-parchment/70 hover:bg-panel"
                }`}
              >
                {s.name} <span className="text-parchment/40">— {s.faculty.name}</span>
              </Link>
            ))}
            {subjects.length === 0 && <p className="text-parchment/40 text-sm">Brak przedmiotów.</p>}
          </div>

          <details className="card p-4">
            <summary className="cursor-pointer text-sm text-brass">+ Nowy przedmiot</summary>
            {faculties.length === 0 ? (
              <p className="text-xs text-burgundy mt-3">
                Brak wydziałów. <Link href="/faculties" className="underline">Dodaj najpierw wydział</Link>.
              </p>
            ) : (
            <form action={createSubject} className="flex flex-col gap-2 mt-3">
              <input name="name" placeholder="Nazwa przedmiotu" required />
              <select name="facultyId" required>
                <option value="">Wydział…</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <input name="ectsPoints" type="number" placeholder="Punkty ECTS" />
              <button type="submit" className="btn-primary text-sm">Utwórz</button>
            </form>
            )}
          </details>
        </div>

        <div>
          {!selected ? (
            <p className="text-parchment/40">Wybierz lub utwórz przedmiot, aby zarządzać pytaniami.</p>
          ) : (
            <>
              <h2 className="font-display text-xl mb-4">
                Pytania — {selected.name} <span className="text-parchment/40 text-base">({selected.questions.length})</span>
              </h2>

              <div className="flex flex-col gap-3 mb-6">
                {selected.questions.map((q) => (
                  <div key={q.id} className="card p-4 flex justify-between items-start gap-4">
                    <div>
                      <p className="text-xs text-brass mb-1">#{q.order} — {q.topic}</p>
                      <p className="text-sm text-parchment/80">{q.content}</p>
                    </div>
                    <form action={deleteExamQuestion}>
                      <input type="hidden" name="id" value={q.id} />
                      <button type="submit" className="btn-danger text-xs shrink-0">Usuń</button>
                    </form>
                  </div>
                ))}
                {selected.questions.length === 0 && (
                  <p className="text-parchment/40 text-sm">Brak pytań — dodaj pierwsze poniżej.</p>
                )}
              </div>

              <div className="card p-6">
                <h3 className="font-display text-lg mb-3">Dodaj pytanie</h3>
                <form action={addExamQuestion} className="flex flex-col gap-3">
                  <input type="hidden" name="subjectId" value={selected.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <input name="topic" placeholder="Temat (np. Mechanika klasyczna)" required />
                    <input name="order" type="number" placeholder="Kolejność (0, 1, 2…)" />
                  </div>
                  <textarea name="content" rows={3} placeholder="Treść pytania" required />
                  <button type="submit" className="btn-primary self-start">Dodaj pytanie</button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
