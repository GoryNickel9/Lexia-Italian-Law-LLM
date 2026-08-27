import type { Metadata } from "next";
import { LEGAL_INFO } from "@/lib/legal-info";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Termini di servizio — Lexia",
  description:
    "Condizioni d'uso del servizio Lexia: descrizione del servizio, avvertenze, credito, account, limitazioni di responsabilità.",
};

export default function TerminiServizioPage() {
  return (
    <LegalPage title="Termini di servizio">
      <p>
        Le presenti condizioni regolano l&apos;utilizzo del servizio {LEGAL_INFO.serviceName},
        un assistente conversazionale basato su intelligenza artificiale specializzato in diritto
        italiano. Con la registrazione dell&apos;account l&apos;utente accetta questi termini.
      </p>

      <h2>1. Descrizione del servizio</h2>
      <p>
        {LEGAL_INFO.serviceName} risponde a domande sul diritto italiano, avvalendosi di un modello
        linguistico e di un corpus normativo aggiornato (fonti: Normattiva). Le risposte vengono
        fornite esclusivamente per domande rientranti in tale ambito.
      </p>

      <h2>2. Avvertenza importante: il servizio non è consulenza legale</h2>
      <p>
        Le risposte hanno <strong>valore esclusivamente informativo</strong> e{" "}
        <strong>non costituiscono consulenza legale</strong>, né sostituiscono il parere di un
        avvocato o di altro professionista abilitato. Le risposte generate dall&apos;intelligenza
        artificiale possono contenere errori, imprecisioni o riferimenti a norme non più vigenti:
        l&apos;utente è tenuto a verificare sempre le fonti sui testi ufficiali e, per decisioni
        concrete, a rivolgersi a un professionista. L&apos;uso delle informazioni fornite è a
        esclusivo rischio dell&apos;utente.
      </p>

      <h2>3. Account</h2>
      <p>
        La registrazione richiede nome, indirizzo email e password. L&apos;utente garantisce la
        veridicità delle informazioni fornite, si impegna a mantenere riservate le proprie
        credenziali ed è responsabile delle attività svolte tramite il proprio account. Il
        servizio è riservato a soggetti maggiorenni e capaci di agire.
      </p>

      <h2>4. Uso consentito e uso vietato</h2>
      <p>L&apos;utente si impegna a usare il servizio in modo lecito e corretto. È vietato in particolare:</p>
      <ul>
        <li>utilizzare il servizio per attività illecite o lesive di diritti di terzi;</li>
        <li>
          tentare di compromettere la sicurezza della piattaforma, aggirare i limiti di utilizzo o
          accedere ad account altrui;
        </li>
        <li>
          estrarre i contenuti in modo massivo (scraping), rivendere il servizio o fornire
          l&apos;accesso a terzi non autorizzati;
        </li>
        <li>
          inserire nelle conversazioni dati personali sensibili propri o di terzi non necessari
          all&apos;oggetto della domanda.
        </li>
      </ul>

      <h2>5. Credito e tariffazione</h2>
      <p>
        Il servizio è prepagato a credito: ogni risposta consuma credito in proporzione ai token di
        input e output effettivamente utilizzati, secondo le tariffe vigenti (che possono variare
        per fascia oraria, &laquo;peak&raquo; e &laquo;off-peak&raquo;). Il credito residuo è
        visibile nell&apos;account. Il credito acquistato non è rimborsabile, salvo diverso accordo
        scritto o disposizioni imperative di legge. Le modifiche alle tariffe si applicano solo
        alle generazioni successive alla loro pubblicazione.
      </p>

      <h2>6. Disponibilità e modifiche del servizio</h2>
      <p>
        Il servizio è fornito &laquo;così com&apos;è&raquo; e &laquo;come disponibile&raquo;, senza
        garanzia di continuità assoluta: possono verificarsi interruzioni per manutenzione,
        aggiornamenti o cause non imputabili al titolare. Il titolare può aggiornare
        l&apos;intelligenza artificiale, il corpus normativo e le funzionalità del servizio.
      </p>

      <h2>7. Sospensione e chiusura</h2>
      <p>
        L&apos;utente può interrompere l&apos;uso in ogni momento e chiedere la cancellazione
        dell&apos;account scrivendo a {LEGAL_INFO.emailContatto}; la cancellazione comporta
        l&apos;eliminazione dei dati personali secondo la{" "}
        <a href="/privacy-policy">Privacy Policy</a>. Il titolare può sospendere o chiudere
        l&apos;account, previa comunicazione ove possibile, in caso di violazione dei presenti
        termini, di abusi che pregiudichino il servizio o di motivi di sicurezza.
      </p>

      <h2>8. Limitazione di responsabilità</h2>
      <p>
        Nei limiti consentiti dalla legge, il titolare non risponde di danni indiretti o
        consequenziali, né delle decisioni prese dall&apos;utente sulla base delle risposte
        ricevute, che — come previsto al punto 2 — hanno valore puramente informativo e vanno
        verificate su fonti ufficiali.
      </p>

      <h2>9. Modifiche ai termini</h2>
      <p>
        Il titolare può modificare i presenti termini pubblicando la versione aggiornata su questa
        pagina. Le modifiche si applicano dall&apos;ultima data di aggiornamento indicata in testa;
        il proseguimento dell&apos;utilizzo del servizio dopo la pubblicazione equivale
        all&apos;accettazione. In caso di modifiche sostanziali l&apos;utente ne sarà informato
        con idoneo preavviso.
      </p>

      <h2>10. Legge applicabile e foro competente</h2>
      <p>
        I presenti termini sono disciplinati dalla legge italiana. Per le controversie è competente
        il foro di [sede del titolare — da completare], salvo il foro del consumatore ove
        applicabile in forza dell&apos;art. 66-bis del codice del consumo.
      </p>

      <h2>11. Contatti</h2>
      <p>
        Per qualsiasi richiesta relativa al servizio: {LEGAL_INFO.emailContatto}.
      </p>
    </LegalPage>
  );
}
