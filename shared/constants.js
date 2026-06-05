export const DEFAULT_SETTINGS = {
  enabled: true,
  minRpm: 2.0,
  minRate: 0,
  minMiles: 0,
  maxMiles: 0,
  hideBelowThreshold: false,
  highlightGoodLoads: true,
  deadheadCity: "",
  deadheadState: "",
  autoRefreshSeconds: 0,
  emailTemplates: [
    {
      id: "default",
      name: "Standard inquiry",
      subject: "Load inquiry — {{origin}} to {{destination}}",
      body: "Hi,\n\nI'm interested in your load from {{origin}} to {{destination}} ({{miles}} mi, {{equipment}}).\n\nPlease confirm availability and best rate.\n\nMC#: {{mcNumber}}\n\nThanks!"
    }
  ],
  activeTemplateId: "default",
  mcNumber: "",
  dotNumber: "",
  companyName: "",
  telegram: {
    enabled: false,
    botToken: "",
    chatId: ""
  },
  fmcsaWebKey: "",
  rts: {
    enabled: true,
    userId: "",
    userPass: "",
    minGrade: ""
  },
  tollguru: {
    enabled: false,
    apiKey: "",
    truckAxles: 5,
    showNetRpm: true
  }
};

export const STORAGE_KEY = "loadExtensionSettings";
export const SEEN_LOADS_KEY = "loadExtensionSeenLoads";

export const LOAD_BOARD_HOSTS = {
  "one.dat.com": "dat-one",
  "power.dat.com": "dat-power",
  "truckstop.com": "truckstop",
  "trucksmarter.com": "trucksmarter"
};
