import {
  ContractPrerequisite,
  Contractual,
  defineConfig,
  LegalBases,
  Statutory,
  Voluntary,
} from "@policystack/sdk";
import { consentLifetime, consentStorage } from "./privacy/storage";

const policy = defineConfig({
  company: {
    name: "Sidequest",
    legalName: "JXD Ltd, trading as Sidequest",
    url: "https://sdqst.app",
    address: "86-90 Paul Street, London, EC2A 4NE, United Kingdom",
    contact: { email: "x@jxd.dev" },
    // DPO and EEA representative applicability require operator review before publication.
  },
  effectiveDate: "2026-09-07",
  jurisdictions: ["uk", "eea"],
  data: {
    collected: {
      "Account information": [
        "Email address",
        "Account identifier",
        "Name and verification status",
        "Account timestamps",
      ],
      "Security and delivery": [
        "Session identifiers",
        "IP address and user agent",
        "Local whiteboard editor identifier and preferences",
        "Hashed sign-in codes",
        "Request and error information",
      ],
      "User content": [
        "Tasks, lanes and projects",
        "Notes and whiteboards",
        "Sync changes and offline mutations",
      ],
      Billing: [
        "Customer, checkout, order and subscription identifiers",
        "Email address",
        "Plan, payment status and billing timestamps",
      ],
      "Accounting records": ["Transaction identifiers", "Payment, tax and reconciliation records"],
      "Email and support": [
        "Email address",
        "Sign-in email content and delivery status",
        "Privacy requests and support correspondence",
      ],
      Analytics: [
        "Visits to the board, billing and connections pages",
        "Static page labels",
        "IP address and browser information received by OpenPanel",
      ],
      "Connected apps": [
        "Client registration information",
        "Permissions and authorisation records",
        "OAuth tokens and expiry times",
        "Content accessed or changed through authorised MCP tools",
      ],
    },
    context: {
      "Account information": {
        purpose: "Create and operate your Sidequest account and authenticate access.",
        lawfulBasis: LegalBases.Contract,
        retention:
          "We determine how long to retain account information based on whether your account remains in use, outstanding account requests, and applicable legal obligations.",
        provision: ContractPrerequisite(
          "Without an email address we cannot create your account or sign you in.",
        ),
      },
      "Security and delivery": {
        purpose:
          "Deliver and protect the service, prevent abuse and investigate faults. Our legitimate interest is keeping accounts and the service secure. External font requests to rsms.me also disclose your IP address and browser request information to its hosting providers.",
        lawfulBasis: LegalBases.LegitimateInterests,
        retention:
          "Retention depends on session and code validity, investigation of security incidents, troubleshooting needs and applicable legal obligations. Expiry prevents use of a credential; it does not promise immediate removal of stored records or logs.",
        provision: ContractPrerequisite(
          "Without the request and authentication information needed to secure the service, we cannot provide access.",
        ),
      },
      "User content": {
        purpose: "Store, display and synchronise your board, including offline edits.",
        lawfulBasis: LegalBases.Contract,
        retention:
          "Retention depends on your continued use of the content, deletion requests, synchronisation and recovery needs, and applicable legal obligations. Browser copies have no automatic expiry and remain until site data is cleared or the browser evicts it.",
        provision: Voluntary(
          "You choose what content to add; features that store or synchronise content need that content to work.",
        ),
      },
      Billing: {
        purpose:
          "Manage subscriptions and paid access. Polar handles checkout and payment information as merchant of record; Sidequest does not receive full card details.",
        lawfulBasis: LegalBases.Contract,
        retention:
          "Retention depends on the transaction and subscription lifecycle, accounting and tax obligations, refunds, disputes and legal claims.",
        provision: ContractPrerequisite(
          "Payment and subscription information is needed to purchase and administer a subscription.",
        ),
      },
      "Accounting records": {
        purpose: "Meet tax and accounting obligations and reconcile transactions.",
        lawfulBasis: LegalBases.LegalObligation,
        retention:
          "Retention depends on applicable tax and accounting requirements, audits and legal claims.",
        provision: Statutory(
          "Records required for tax and accounting obligations must be provided or retained when you make a purchase.",
        ),
      },
      "Email and support": {
        purpose:
          "Send requested sign-in codes and respond to account, support and privacy requests through x@jxd.dev.",
        lawfulBasis: LegalBases.Contract,
        retention:
          "Retention depends on delivery and troubleshooting needs, resolving your request, and keeping records needed for applicable legal obligations. Sign-in codes are valid for five minutes; email and delivery records may remain longer.",
        provision: Voluntary(
          "Without your email and the information relevant to a request we may be unable to respond or send a sign-in code.",
        ),
      },
      Analytics: {
        purpose:
          "With your permission, use OpenPanel to understand visits to the board, billing and connected-app pages. We send fixed paths and labels, excluding query strings, fragments, full referrers, account identity and user content. We do not enable session replay. Rejecting analytics does not affect access. Change or withdraw your choice using Cookie settings.",
        lawfulBasis: LegalBases.Consent,
        retention:
          "Retention depends on the need to understand product usage and applicable provider retention settings. Withdrawal stops new events; requests already underway may complete. Contact x@jxd.dev about data already collected.",
        provision: Voluntary(
          "There is no effect on sign-in, billing or offline functionality if you decline analytics.",
        ),
      },
      "Connected apps": {
        purpose:
          "Allow apps you authorise to read or change Sidequest content through MCP within the permissions granted. Revoking an app stops future authorised access; copies already received are governed by that app’s policies.",
        lawfulBasis: LegalBases.Contract,
        retention:
          "Retention depends on the authorisation lifecycle, token validity, revocation, security investigations and synchronisation needs. Revocation or token expiry does not promise immediate deletion of all associated records.",
        provision: Contractual(
          "Connecting an app requires its client details and permission records. Connecting apps is optional.",
        ),
      },
    },
  },
  thirdParties: [
    {
      name: "Cloudflare",
      purpose:
        "Hosting, request delivery, security, D1 account and billing storage, and Durable Objects board storage and sync.",
      policyUrl: "https://www.cloudflare.com/privacypolicy/",
    },
    {
      name: "Resend",
      purpose:
        "Deliver sign-in emails, processing recipient addresses, message content and delivery records.",
      policyUrl: "https://resend.com/legal/privacy-policy",
    },
    {
      name: "Polar",
      purpose:
        "Merchant of record for subscriptions, checkout, payment, tax and billing administration.",
      policyUrl: "https://polar.sh/legal/privacy-policy",
    },
    {
      name: "OpenPanel",
      purpose: "Optional product analytics, enabled only after your permission.",
      policyUrl: "https://openpanel.dev/privacy",
    },
    {
      name: "rsms.me (Inter font hosting)",
      purpose:
        "Serve the Inter stylesheet and fonts; your browser sends network and browser information when requesting them.",
      policyUrl: "https://rsms.me/inter/",
    },
    {
      name: "tldraw asset hosting",
      purpose:
        "Deliver whiteboard fonts and editor assets from cdn.tldraw.com; requests disclose network and browser information.",
    },
    {
      name: "Apps you authorise",
      purpose:
        "Receive account or board information available through the MCP permissions you grant. Review the app’s privacy notice before connecting it.",
    },
  ],
  automatedDecisionMaking: [],
  cookies: {
    used: { essential: true, analytics: true },
    context: {
      essential: {
        lawfulBasis: LegalBases.Contract,
        label: "Necessary storage",
        description:
          "Sign-in, security, offline data and your privacy choices. Always enabled to provide these features.",
      },
      analytics: {
        lawfulBasis: LegalBases.Consent,
        label: "Analytics",
        description:
          "Allow OpenPanel to measure visits to the board, billing and connections pages.",
      },
    },
  },
  trackingTechnologies: [
    "Authentication cookies",
    "SQLite in Origin Private File System (OPFS)",
    "IndexedDB offline outbox and localStorage fallback",
    "localStorage consent preferences",
    "Optional OpenPanel network requests and in-memory state",
  ],
  consent: {
    adapter: consentStorage,
    // No geolocation resolver: PolicyStack defaults to opt-in for every visitor.
    triggers: { policyVersionChanged: true, categoriesAdded: true, expiresAfter: consentLifetime },
  },
});

// Include both documents in re-consent. Bump the suffix for material changes to
// the custom dictionary or storage inventory, which are outside SDK hashing.
export default {
  ...policy,
  cookieVersion: `${policy.cookieVersion}:${policy.privacyVersion}:2`,
};
