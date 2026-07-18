/**
 * examService.js
 *
 * Realizuje pkt. 6.2 specyfikacji:
 *  /egzamin start [przedmiot] [temat] wywołane przez wykładowcę na kanale wydziału
 *   -> bot pobiera pytania z Dashboardu (ExamQuestion)
 *   -> wysyła DM do wszystkich studentów przypisanych do wydziału danego kanału
 *   -> zbiera odpowiedzi kolejno pytanie-po-pytaniu w DM
 *   -> po zakończeniu kompiluje arkusz i wysyła embed/plik na kanał wyników
 *
 * Wzorzec: Service Layer + Collector Pattern (discord.js MessageCollector per student)
 */

const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const prisma = require("../lib/prisma");

const ANSWER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minut na pytanie

class ExamService {
  /**
   * @param client Discord.Client
   * @param options { subjectName, topic, facultyChannelId, resultsChannelId, startedById, guild }
   */
  async startExam(client, options) {
    const { subjectName, topic, facultyChannelId, resultsChannelId, startedById, guild } = options;

    const subject = await prisma.subject.findFirst({
      where: { name: subjectName },
      include: { questions: { orderBy: { order: "asc" } }, faculty: true },
    });

    if (!subject) throw new Error(`Nie znaleziono przedmiotu "${subjectName}".`);
    if (subject.questions.length === 0)
      throw new Error(`Brak pytań egzaminacyjnych dla "${subjectName}" — dodaj je w Dashboardzie.`);

    const session = await prisma.examSession.create({
      data: {
        subjectId: subject.id,
        topic,
        channelId: facultyChannelId,
        resultsChannelId,
        startedById,
        status: "ONGOING",
      },
    });

    // Studenci powiązani z wydziałem tego przedmiotu
    const students = await prisma.character.findMany({
      where: { facultyId: subject.facultyId },
      include: { user: true },
    });

    if (students.length === 0) {
      throw new Error("Brak studentów przypisanych do tego wydziału.");
    }

    // Odpalamy DM-y równolegle, ale każdy student ma niezależny "wątek" odpowiedzi
    const results = await Promise.allSettled(
      students.map((student) =>
        this._runStudentExam(client, guild, student, subject, session)
      )
    );

    await prisma.examSession.update({
      where: { id: session.id },
      data: { status: "CLOSED", closedAt: new Date() },
    });

    const summary = results.map((r, i) => ({
      student: students[i],
      ok: r.status === "fulfilled",
      reason: r.status === "rejected" ? r.reason.message : null,
    }));

    await this._publishResults(client, session, subject, summary);

    return { session, notified: students.length };
  }

  /** Prowadzi jednego studenta przez wszystkie pytania na DM */
  async _runStudentExam(client, guild, student, subject, session) {
    const discordUser = await client.users.fetch(student.userId).catch(() => null);
    if (!discordUser) throw new Error("Nie udało się otworzyć DM (zablokowane wiadomości?)");

    const dm = await discordUser.createDM();

    await dm.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(`📝 Egzamin: ${subject.name} — ${session.topic}`)
          .setDescription(
            `Masz ${subject.questions.length} pytań. Na każde odpowiedz w ciągu 5 minut, wysyłając wiadomość na tym czacie.`
          )
          .setColor(0x1a2a6c),
      ],
    });

    for (const question of subject.questions) {
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`Pytanie ${question.order + 1}/${subject.questions.length}`)
            .setDescription(question.content)
            .setColor(0x2a52be),
        ],
      });

      const collected = await dm
        .awaitMessages({
          filter: (m) => m.author.id === discordUser.id,
          max: 1,
          time: ANSWER_TIMEOUT_MS,
          errors: ["time"],
        })
        .catch(() => null);

      const answerText = collected?.first()?.content ?? "(brak odpowiedzi — czas minął)";

      await prisma.examAnswer.create({
        data: {
          sessionId: session.id,
          userId: student.userId,
          questionId: question.id,
          answer: answerText,
        },
      });
    }

    await dm.send("✅ Egzamin zakończony. Dziękujemy za odpowiedzi.");
  }

  /** Kompiluje wyniki wszystkich studentów w jeden arkusz i wysyła na kanał wykładowcy */
  async _publishResults(client, session, subject, summary) {
    const answers = await prisma.examAnswer.findMany({
      where: { sessionId: session.id },
      include: { user: { include: { character: true } } },
    });

    const lines = [`ARKUSZ WYNIKÓW — ${subject.name} — ${session.topic}`, ""];

    for (const s of summary) {
      const name = `${s.student.firstNameIC} ${s.student.lastNameIC}`;
      lines.push(`### ${name} (${s.student.albumNumber})`);
      if (!s.ok) {
        lines.push(`  [NIE WZIĘTO UDZIAŁU: ${s.reason}]`);
        continue;
      }
      const studentAnswers = answers.filter((a) => a.userId === s.student.userId);
      for (const a of studentAnswers) {
        lines.push(`  - ${a.answer}`);
      }
      lines.push("");
    }

    const buffer = Buffer.from(lines.join("\n"), "utf-8");
    const file = new AttachmentBuilder(buffer, { name: `wyniki_${subject.name}.txt` });

    const channel = await client.channels.fetch(session.resultsChannelId);
    await channel.send({
      content: `📊 Egzamin z **${subject.name}** zakończony. Wzięło udział: ${
        summary.filter((s) => s.ok).length
      }/${summary.length}.`,
      files: [file],
    });
  }
}

module.exports = new ExamService();
