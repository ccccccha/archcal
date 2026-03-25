/* global window */

(() => {
  const LOCATIONS = ["Bangkok", "Chiang Mai", "Phuket", "Khon Kaen", "Other Province"];

  const SCOPE_IDS = ["arch", "int", "land", "demo"];

  const SCOPE_LABELS = {
    arch: "Architecture (Structure + Facade)",
    int: "Interior Design",
    land: "Landscape",
    demo: "Demolition / Renovation"
  };

  const SCOPE_RANGES_THB_PER_SQM = {
    arch: { min: 15000, max: 35000 },
    int: { min: 8000, max: 25000 },
    land: { min: 3000, max: 8000 },
    demo: { min: 2000, max: 6000 }
  };

  const DEFAULT_RATES_THB_PER_SQM = {
    arch: {
      Bangkok: 25000,
      "Chiang Mai": 18000,
      Phuket: 22000,
      "Khon Kaen": 16000,
      "Other Province": 17000
    },
    int: {
      Bangkok: 15000,
      "Chiang Mai": 11000,
      Phuket: 13000,
      "Khon Kaen": 10000,
      "Other Province": 10000
    },
    land: {
      Bangkok: 5000,
      "Chiang Mai": 4000,
      Phuket: 4500,
      "Khon Kaen": 3500,
      "Other Province": 3500
    },
    demo: {
      Bangkok: 4000,
      "Chiang Mai": 3000,
      Phuket: 3500,
      "Khon Kaen": 2500,
      "Other Province": 2500
    }
  };

  function normalizeLocation(location) {
    return LOCATIONS.includes(location) ? location : "Other Province";
  }

  function getScopeRangeTHBPerSqm(scopeId) {
    return SCOPE_RANGES_THB_PER_SQM[scopeId] || { min: 0, max: 0 };
  }

  function getDefaultScopeRateTHBPerSqm({ scopeId, location, projectType }) {
    void projectType;
    const loc = normalizeLocation(location);
    return DEFAULT_RATES_THB_PER_SQM?.[scopeId]?.[loc] ?? 0;
  }

  window.ARCHCALC_DATA = {
    LOCATIONS,
    SCOPE_IDS,
    SCOPE_LABELS,
    getScopeRangeTHBPerSqm,
    getDefaultScopeRateTHBPerSqm
  };
})();
