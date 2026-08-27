import type { Metadata } from "next";
import { LEGAL_INFO } from "@/lib/legal-info";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy — Lexia",
  description:
    "Informativa sul trattamento dei dati personali ai sensi dell'art. 13 del Regolamento UE 2016/679 (GDPR) per il servizio Lexia.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        La presente informativa descrive come {LEGAL_INFO.serviceName} tratta i dati personali
        degli utenti, ai sensi dell&apos;art. 13 del Regolamento (UE) 2016/679 (&laquo;GDPR&raquo;).
      </p>

      <h2>1. Titolare del trattamento</h2>
      <p>
        Titolare del trattamento: <strong>{LEGAL_INFO.titolare}</strong> — {LEGAL_INFO.titolareDettagli}.
        Email di contatto per qualsiasi richiesta in materia di dati personali:{" "}
        <strong>{LEGAL_INFO.emailContatto}</strong>.
      </p>

      <h2>2. Dati trattati, finalità e basi giuridiche</h2>
      <p>
        <strong>a) Dati di account.</strong> Per creare e gestire l&apos;account trattiamo: nome,
        indirizzo email e password (conservata esclusivamente in forma cifrata, mai in chiaro).
        <em> Finalità</em>: registrazione, autenticazione ed erogazione del servizio.
        <em> Base giuridica</em>: esecuzione del contratto di cui ai Termini di servizio (art. 6.1.b GDPR).
      </p>
      <p>
        <strong>b) Contenuti delle conversazioni e dati di utilizzo.</strong> Trattiamo le domande e
        le risposte delle chat, il numero di token utilizzati, il relativo costo e il credito residuo
        dell&apos;account.
        <em> Finalità</em>: fornire il servizio di assistenza conversazionale, mostrare lo storico
        delle chat e calcolare il credito consumato.
        <em> Base giuridica</em>: esecuzione del contratto (art. 6.1.b GDPR).
      </p>
      <p>
        <strong>c) Preferenze.</strong> Tema chiaro/scuro scelto dall&apos;utente, associato
        all&apos;account per mantenerlo su tutti i dispositivi.
        <em> Base giuridica</em>: esecuzione del contratto (art. 6.1.b GDPR).
      </p>
      <p>
        <strong>d) Dati tecnici e di sicurezza.</strong> L&apos;infrastruttura di hosting può
        registrare dati di log (come indirizzo IP, data e ora delle richieste) per finalità di
        sicurezza, prevenzione degli abusi e diagnosi dei guasti.
        <em> Base giuridica</em>: legittimo interesse del titolare (art. 6.1.f GDPR).
      </p>
      <p>
        Il servizio non richiede dati particolari (art. 9 GDPR). L&apos;utente è pregato di non
        inserire nelle conversazioni dati sensibili o di terzi non necessari.
      </p>

      <h2>3. Modalità del trattamento e conservazione</h2>
      <p>
        I dati sono trattati con strumenti elettronici e conservati su database gestito dal
        titolare. Le conversazioni e i dati di account sono conservati fino alla cancellazione
        dell&apos;account o all&apos;eliminazione delle singole chat da parte dell&apos;utente.
        I dati di log sono conservati per il periodo strettamente necessario alle finalità di
        sicurezza, secondo le policy della piattaforma di hosting.
      </p>

      <h2>4. Destinatari dei dati</h2>
      <p>
        I dati non sono ceduti né venduti a terzi per finalità di marketing. Per l&apos;erogazione
        del servizio i dati possono essere trattati da fornitori designati quali responsabili del
        trattamento o trattati come autonomi per obblighi di legge:
      </p>
      <ul>
        <li>
          <strong>Fornitore di hosting e piattaforma applicativa</strong> (esecuzione dell&apos;applicazione
          web e dei log tecnici);
        </li>
        <li>
          <strong>Fornitore del database gestito</strong> (conservazione di account, chat e crediti);
        </li>
        <li>
          <strong>{LEGAL_INFO.llmBackend}</strong>, che elabora il testo delle domande per generare
          le risposte e interrogare il corpus normativo locale. Le conversazioni non sono usate per
          addestrare modelli.
        </li>
      </ul>
      <p>
        I dati possono inoltre essere comunicati a soggetti autorizzati dal diritto (autorità
        giudiziarie e di pubblica sicurezza) nei casi previsti dalla legge.
      </p>

      <h2>5. Trasferimenti extra-UE</h2>
      <p>
        Alcuni fornitori indicati al punto 4 potrebbero avere sede o server fuori dallo Spazio
        Economico Europeo (ad esempio negli Stati Uniti). In tal caso il trasferimento avviene nel
        rispetto degli artt. 44 ss. GDPR, mediante adeguatezze della Commissione Europea o clausole
        contrattarie tipo. [Elencare i fornitori effettivi e le relative garanzie prima della messa
        in produzione.]
      </p>

      <h2>6. Cookie</h2>
      <p>
        Il servizio utilizza esclusivamente cookie tecnici necessari al funzionamento
        (autenticazione e sicurezza). Per i dettagli si veda la{" "}
        <a href="/cookie-policy">Cookie Policy</a>.
      </p>

      <h2>7. Diritti dell&apos;interessato</h2>
      <p>
        L&apos;utente può esercitare in ogni momento i diritti previsti dagli artt. 15-22 GDPR:
        accesso, rettifica, cancellazione, limitazione, portabilità, opposizione, nonché la revoca
        del consenso ove previsto, scrivendo a {LEGAL_INFO.emailContatto}.
      </p>
      <p>
        L&apos;utente ha inoltre il diritto di proporre reclamo al Garante per la protezione dei
        dati personali (<a href="https://www.garanteprivacy.it" rel="noopener noreferrer" target="_blank">www.garanteprivacy.it</a>).
      </p>

      <h2>8. Natura del conferimento</h2>
      <p>
        Il conferimento dei dati di account (nome, email, password) è necessario per registrarsi e
        usare il servizio; il suo rifiuto rende impossibile l&apos;erogazione. Il resto dei dati è
        trattato automaticamente nell&apos;uso del servizio.
      </p>

      <h2>9. Modifiche all&apos;informativa</h2>
      <p>
        La presente informativa può essere modificata per adeguamenti normativi o evoluzioni del
        servizio. La versione pubblicata su questa pagina è quella vigente; si invita a
        consultarla periodicamente.
      </p>
    </LegalPage>
  );
}
