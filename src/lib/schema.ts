import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Tutti i dati del sito vivono su Turso: utenti, chat e messaggi.
// Il PostgreSQL sulla VPS è di Hermes Agent: il sito non lo tocca.

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  // "user" | "admin": gli admin accedono al pannello di amministrazione
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  // Credito dell'utente in centesimi di euro (500 = 5,00 €)
  balanceCents: integer("balance_cents").notNull().default(sql`500`),
  // Resto di addebito sotto il centesimo, in millesimi di centesimo: con la
  // tariffazione a token il costo di una risposta è spesso frazione di centesimo
  unbilledMillicents: integer("unbilled_millicents").notNull().default(sql`0`),
  // Tema preferito ("dark" | "light" | null = segue il sistema), salvato nel db
  // così la preferenza vale su tutti i dispositivi
  theme: text("theme", { enum: ["dark", "light"] }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// Impostazioni globali del sito (key/value): registrazioni aperte,
// costo per messaggio, ecc. Vedi src/lib/settings.ts per le chiavi.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const chats = sqliteTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Nuova chat"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("chats_user_id_idx").on(t.userId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    // Consumo token della risposta dell'assistente (null per i messaggi utente
    // e per le risposte precedenti all'introduzione della tariffazione a token)
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    // Costo effettivamente addebitato in millesimi di centesimo: salvato qui
    // perché i prezzi possono cambiare e la chat deve mostrare quello pagato
    costMillicents: integer("cost_millicents"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("messages_chat_id_idx").on(t.chatId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chats),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, { fields: [chats.userId], references: [users.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
}));

export type User = typeof users.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Setting = typeof settings.$inferSelect;
