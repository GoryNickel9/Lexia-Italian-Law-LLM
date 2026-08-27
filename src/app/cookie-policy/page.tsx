import type { Metadata } from "next";
import { LEGAL_INFO } from "@/lib/legal-info";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy — Lexia",
  description:
    "Quali cookie utilizza Lexia: esclusivamente cookie tecnici necessari ad autenticazione e sicurezza. Nessun cookie di profilazione o tracciamento.",
};

export default function CookiePolicyPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        Questa pagina spiega quali cookie e tecniche di memorizzazione locale utilizza{" "}
        {LEGAL_INFO.serviceName} e come gestirli.
      </p>

      <h2>1. Cosa sono i cookie</h2>
      <p>
        I cookie sono piccoli file di testo che un sito memorizza sul dispositivo dell&apos;utente
        durante la navigazione. Servono, ad esempio, a mantenere l&apos;utente autenticato tra una
        pagina e l&apos;altra.
      </p>

      <h2>2. Cookie utilizzati</h2>
      <p>
        {LEGAL_INFO.serviceName} utilizza <strong>esclusivamente cookie tecnici</strong>, necessari
        al funzionamento del servizio, collegati alla sessione di accesso gestita dalla libreria di
        autenticazione (Auth.js/NextAuth):
      </p>
      <ul>
        <li>
          <strong>Cookie di sessione</strong> (<code>authjs.session-token</code>, in produzione
          <code> __Secure-authjs.session-token</code>): contiene un token cifrato che mantiene
          l&apos;utente autenticato. È un cookie <em>httpOnly</em>: non è leggibile da script e non
          contiene dati personali in chiaro. Durata: 30 giorni o fino al logout.
        </li>
        <li>
          <strong>Cookie CSRF</strong> (<code>authjs.csrf-token</code>): protegge le operazioni di
          accesso e uscita dagli attacchi cross-site request forgery. Temporaneo.
        </li>
        <li>
          <strong>Cookie di flusso di autenticazione</strong> (<code>authjs.callback-url</code>,{" "}
          <code>authjs.state</code>): temporanei, servono a completare correttamente il login e
          vengono eliminati subito dopo.
        </li>
        <li>
          <strong>Preferenza tema</strong>: salvata in <code>localStorage</code> (tecnica locale
          assimilata ai cookie tecnici) per ricordare la scelta chiaro/scuro del dispositivo.
        </li>
      </ul>

      <h2>3. Cookie assenti</h2>
      <p>
        {LEGAL_INFO.serviceName} <strong>non utilizza</strong> cookie analitici, di profilazione,
        di marketing o di tracciamento di terze parti (ad esempio Google Analytics, Meta Pixel o
        simili), né strumenti pubblicitari.
      </p>

      <h2>4. Perché non compare un banner</h2>
      <p>
        Il consenso preventivo dell&apos;utente non è richiesto per i cookie tecnici, ai sensi
        dell&apos;art. 122 del Codice in materia di protezione dei dati personali e delle linee
        guida del Garante per la protezione dei dati personali: senza i cookie di sessione il
        servizio non potrebbe funzionare in sicurezza. Poiché non vengono emessi altri cookie, non
        è presente alcun banner di consenso.
      </p>

      <h2>5. Gestione ed eliminazione dei cookie</h2>
      <p>
        L&apos;utente può cancellare o bloccare i cookie dalle impostazioni del proprio browser
        (di solito nella sezione &laquo;Privacy e sicurezza&raquo;). La rimozione del cookie di
        sessione comporta il semplice logout; il blocco permanente impedisce l&apos;accesso al
        servizio. Il pulsante &laquo;Esci&raquo; all&apos;interno dell&apos;applicazione invalida
        immediatamente la sessione.
      </p>

      <h2>6. Aggiornamenti</h2>
      <p>
        Qualora in futuro venissero introdotti cookie non tecnici, la presente policy verrà
        aggiornata e, ove richiesto, verrà raccolto il consenso preventivo dell&apos;utente
        mediante apposito banner.
      </p>
    </LegalPage>
  );
}
