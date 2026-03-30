/* global window */

(() => {
  const SQFT_PER_SQM = 10.7639;

  const STEP_META = [
    {
      title: "Project Info",
      description: "Set the project fundamentals first. We will use this to shape later budget logic."
    },
    {
      title: "Construction Costs",
      description: "Select each work scope and set its cost rate."
    },
    {
      title: "Operations",
      description: "Estimate costs the client needs to open and run."
    },
    {
      title: "Design & Fees",
      description: "Professional fees and authority requirements."
    }
  ];

  /** Cached for updateLiveDashboard (toggle-only updates avoid reparsing form). */
  let lastDashboardTotals = {
    scope: 0,
    ops: 0,
    design: 0,
    grand: 0,
    firstBudget: 0
  };

  let liveBudgetChart = null;

  const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const fmtBaht = (n) => `฿ ${nf0.format(Math.round(Number.isFinite(n) ? n : 0))}`;

  const toNum = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    const el = qs(id);
    if (el) el.textContent = text;
  }

  function setHidden(id, hidden) {
    const el = qs(id);
    if (el) el.classList.toggle("hidden", !!hidden);
  }

  function getProjectAreaSqm() {
    const areaInput = qs("projectAreaInput");
    const unitSelect = qs("areaUnitSelect");
    const raw = toNum(areaInput?.value);
    const unit = unitSelect?.value || "sqm";
    if (raw <= 0) return 0;
    return unit === "sqft" ? raw / SQFT_PER_SQM : raw;
  }

  function convertAreaValue(previousUnit, nextUnit) {
    const areaInput = qs("projectAreaInput");
    const raw = Number.parseFloat(areaInput?.value || "");
    if (!Number.isFinite(raw)) return;
    let converted = raw;
    if (previousUnit === "sqm" && nextUnit === "sqft") converted = raw * SQFT_PER_SQM;
    if (previousUnit === "sqft" && nextUnit === "sqm") converted = raw / SQFT_PER_SQM;
    areaInput.value = converted.toFixed(2);
  }

  function getStepPanels() {
    return Array.from(document.querySelectorAll("[data-step-panel]"));
  }

  function getStepDots() {
    return Array.from(document.querySelectorAll("[data-step-dot]"));
  }

  function getStepLabels() {
    return Array.from(document.querySelectorAll("[data-step-label]"));
  }

  function updateProgressUi(currentStep) {
    const totalSteps = STEP_META.length;
    const progressFill = qs("progressFill");
    const stepCounterText = qs("stepCounterText");
    const stepTitleText = qs("stepTitleText");
    const stepDescriptionText = qs("stepDescriptionText");
    const stepDots = getStepDots();
    const stepLabels = getStepLabels();
    const stepPanels = getStepPanels();

    const fillPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
    if (progressFill) progressFill.style.height = `${fillPercent}%`;

    if (stepCounterText) stepCounterText.textContent = `Step ${currentStep} of ${totalSteps}`;
    if (stepTitleText) stepTitleText.textContent = STEP_META[currentStep - 1].title;
    if (stepDescriptionText) stepDescriptionText.textContent = STEP_META[currentStep - 1].description;

    stepDots.forEach((dot, idx) => {
      const stepNumber = idx + 1;
      dot.classList.remove(
        "archcalc-nav-step-active",
        "bg-black",
        "text-white",
        "border-black",
        "bg-white",
        "text-black/45",
        "border-black/30"
      );
      if (stepNumber === currentStep) {
        dot.classList.add("archcalc-nav-step-active", "bg-black", "text-white", "border-black");
      } else {
        dot.classList.add("bg-white", "text-black/45", "border-black/30");
      }
    });

    stepLabels.forEach((label, idx) => {
      const stepNumber = idx + 1;
      label.classList.remove("text-black", "text-black/45");
      label.classList.add(stepNumber === currentStep ? "text-black" : "text-black/45");
    });

    stepPanels.forEach((panel) => {
      const panelStep = Number.parseInt(panel.getAttribute("data-step-panel") || "0", 10);
      panel.classList.toggle("hidden", panelStep !== currentStep);
    });
  }

  function getScopeConfig() {
    return [
      { id: "arch", enabled: "scope_arch_enabled", fields: "scope_arch_fields", area: "scope_arch_area", rate: "scope_arch_rate", hint: "scope_arch_hint", subtotal: "scope_arch_subtotal", modeDefault: "scope_arch_mode_default", modeOwn: "scope_arch_mode_own" },
      { id: "int", enabled: "scope_int_enabled", fields: "scope_int_fields", area: "scope_int_area", rate: "scope_int_rate", hint: "scope_int_hint", subtotal: "scope_int_subtotal", modeDefault: "scope_int_mode_default", modeOwn: "scope_int_mode_own" },
      { id: "land", enabled: "scope_land_enabled", fields: "scope_land_fields", area: "scope_land_area", rate: "scope_land_rate", hint: "scope_land_hint", subtotal: "scope_land_subtotal", modeDefault: "scope_land_mode_default", modeOwn: "scope_land_mode_own" },
      { id: "demo", enabled: "scope_demo_enabled", fields: "scope_demo_fields", area: "scope_demo_area", rate: "scope_demo_rate", hint: "scope_demo_hint", subtotal: "scope_demo_subtotal", modeDefault: "scope_demo_mode_default", modeOwn: "scope_demo_mode_own" }
    ];
  }

  function ensureScopeDefaults() {
    const location = qs("siteLocation")?.value || "Bangkok";
    const projectType = qs("projectType")?.value || "Other";
    const baseArea = getProjectAreaSqm();
    const data = window.ARCHCALC_DATA;

    getScopeConfig().forEach((s) => {
      const enabled = qs(s.enabled);
      const fields = qs(s.fields);
      const areaEl = qs(s.area);
      const rateEl = qs(s.rate);
      const hintEl = qs(s.hint);
      const modeDefault = qs(s.modeDefault);
      const modeOwn = qs(s.modeOwn);

      if (fields && enabled) fields.classList.toggle("hidden", !enabled.checked);

      if (hintEl && data?.getScopeRangeTHBPerSqm) {
        const r = data.getScopeRangeTHBPerSqm(s.id);
        hintEl.textContent = `Range: ${nf0.format(r.min)}–${nf0.format(r.max)} THB/sqm`;
      }

      if (enabled?.checked) {
        if (areaEl && (!areaEl.value || toNum(areaEl.value) === 0) && baseArea > 0) {
          areaEl.value = baseArea.toFixed(2);
        }
        if (modeDefault && modeOwn && !modeDefault.checked && !modeOwn.checked) {
          modeDefault.checked = true;
        }
        const useDefault = modeDefault?.checked;
        const defaultRate = data?.getDefaultScopeRateTHBPerSqm?.({ scopeId: s.id, location, projectType }) ?? 0;
        if (rateEl) {
          if (useDefault) {
            rateEl.readOnly = true;
            rateEl.classList.add("bg-black/5");
            rateEl.value = String(defaultRate);
          } else {
            rateEl.readOnly = false;
            rateEl.classList.remove("bg-black/5");
            if (!rateEl.value) rateEl.value = String(defaultRate);
          }
        }
      } else {
        if (areaEl) areaEl.value = areaEl.value || "0";
        if (rateEl) rateEl.value = rateEl.value || "0";
      }
    });
  }

  function readScopeTotals() {
    const data = window.ARCHCALC_DATA;
    let total = 0;
    const rows = [];

    getScopeConfig().forEach((s) => {
      const enabled = qs(s.enabled)?.checked;
      const area = toNum(qs(s.area)?.value);
      const rate = toNum(qs(s.rate)?.value);
      const sub = enabled ? area * rate : 0;
      total += sub;
      setText(s.subtotal, fmtBaht(sub));
      if (enabled && data?.SCOPE_LABELS?.[s.id]) {
        rows.push({ label: data.SCOPE_LABELS[s.id], amount: sub });
      }
    });

    return { total, rows };
  }

  function renderSummaryList(containerId, rows) {
    const el = qs(containerId);
    if (!el) return;
    el.innerHTML = "";
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-4 text-sm";
      row.innerHTML = `<p class="text-black/60">${r.label}</p><p class="font-heading font-semibold">${fmtBaht(r.amount)}</p>`;
      el.appendChild(row);
    });
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-sm text-black/45";
      empty.textContent = "No items selected yet.";
      el.appendChild(empty);
    }
  }

  function getOperationsConfig(projectType, options) {
    const skipDom = options && options.skipDom;
    const showKitchen = ["Restaurant", "Cafe"].includes(projectType);
    const showPOS = ["Retail", "Restaurant", "Cafe", "Office"].includes(projectType);

    if (!skipDom) {
      setHidden("ops_kitchen_block", !showKitchen);
      setHidden("ops_pos_block", !showPOS);
    }

    return [
      { id: "Furniture & Décor", enabled: "ops_furniture_enabled", fields: "ops_furniture_fields", amount: "ops_furniture_amount" },
      ...(showKitchen ? [{ id: "Kitchen Equipment", enabled: "ops_kitchen_enabled", fields: "ops_kitchen_fields", amount: "ops_kitchen_amount" }] : []),
      ...(showPOS ? [{ id: "POS & Technology", enabled: "ops_pos_enabled", fields: "ops_pos_fields", amount: "ops_pos_amount" }] : []),
      { id: "Signage & Branding", enabled: "ops_signage_enabled", fields: "ops_signage_fields", amount: "ops_signage_amount" },
      { id: "Cleaning & Handover", enabled: "ops_cleaning_enabled", fields: "ops_cleaning_fields", amount: "ops_cleaning_amount" },
      { id: "Franchise / Brand Fee", enabled: "ops_franchise_enabled", fields: "ops_franchise_fields", amount: "ops_franchise_amount" },
      { id: "Pre-opening Operations", enabled: "ops_preopen_enabled", fields: "ops_preopen_fields", amount: "ops_preopen_amount" }
    ];
  }

  function ensureOpsDefaults(projectType) {
    const cfg = getOperationsConfig(projectType);
    cfg.forEach((c) => {
      const enabled = qs(c.enabled);
      const fields = qs(c.fields);
      const amountEl = qs(c.amount);
      if (fields && enabled) fields.classList.toggle("hidden", !enabled.checked);
      if (amountEl && !amountEl.value) amountEl.value = "0";
    });
  }

  function readOperationsTotals(projectType) {
    const cfg = getOperationsConfig(projectType);
    let total = 0;
    const rows = [];
    cfg.forEach((c) => {
      const enabled = qs(c.enabled)?.checked;
      const amount = toNum(qs(c.amount)?.value);
      const val = enabled ? amount : 0;
      total += val;
      if (enabled) rows.push({ label: c.id, amount: val });
    });

    // custom ops rows
    const customList = qs("opsCustomList");
    if (customList) {
      const customRows = Array.from(customList.querySelectorAll("[data-ops-item-row]"));
      customRows.forEach((row) => {
        const label = row.querySelector("[data-ops-item-label]")?.value?.trim() || "Custom item";
        const amount = toNum(row.querySelector("[data-ops-item-amount]")?.value);
        total += amount;
        rows.push({ label, amount });
      });
    }

    return { total, rows };
  }

  function addOpsItemRow() {
    const list = qs("opsCustomList");
    if (!list) return;
    const row = document.createElement("div");
    row.setAttribute("data-ops-item-row", "true");
    row.className = "flex flex-col gap-2 sm:flex-row sm:items-center";
    row.innerHTML = `
      <input data-ops-item-label type="text" class="w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black" placeholder="Item label" />
      <div class="flex items-center gap-2">
        <input data-ops-item-amount type="number" min="0" step="100" inputmode="numeric" class="w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black sm:w-52" value="0" />
        <span class="text-sm text-black/55">THB</span>
        <button type="button" data-ops-item-remove class="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white text-lg leading-none text-black/70 transition hover:border-black/30" aria-label="Remove item" title="Remove">×</button>
      </div>
    `;
    row.querySelector("[data-ops-item-amount]").addEventListener("input", calculateAll);
    row.querySelector("[data-ops-item-remove]").addEventListener("click", () => {
      row.remove();
      calculateAll();
    });
    list.appendChild(row);
    calculateAll();
  }

  function updateFeeZoneHighlight(percent) {
    const p = Number.isFinite(percent) ? percent : NaN;
    const isGreen = Number.isFinite(p) && p >= 5 && p < 7.5;
    const isAmber = Number.isFinite(p) && p >= 7.5 && p < 12;
    const isBlue = Number.isFinite(p) && p >= 12;
    const none = !isGreen && !isAmber && !isBlue;

    const zones = [
      { el: qs("feeZoneAffordable"), active: isGreen },
      { el: qs("feeZoneNormal"), active: isAmber },
      { el: qs("feeZonePremium"), active: isBlue }
    ];

    zones.forEach(({ el, active }) => {
      if (!el) return;
      el.classList.toggle("opacity-40", none ? true : !active);
      el.classList.toggle("opacity-100", none ? false : active);
      el.classList.toggle("ring-2", !none && active);
      el.classList.toggle("ring-black/30", !none && active);
      el.classList.toggle("ring-inset", !none && active);
    });
  }

  function getFeeItemsSubtotal() {
    const list = qs("feeItemsList");
    if (!list) return 0;
    const rows = Array.from(list.querySelectorAll("[data-fee-item-row]"));
    return rows.reduce((sum, row) => sum + toNum(row.querySelector("[data-fee-item-amount]")?.value), 0);
  }

  function addFeeItemRow() {
    const list = qs("feeItemsList");
    if (!list) return;
    const row = document.createElement("div");
    row.setAttribute("data-fee-item-row", "true");
    row.className = "flex flex-col gap-2 sm:flex-row sm:items-center";
    row.innerHTML = `
      <input data-fee-item-label type="text" class="w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black" placeholder="Item label" />
      <div class="flex items-center gap-2">
        <input data-fee-item-amount type="number" min="0" step="100" inputmode="numeric" class="w-full rounded-xl border border-black/20 bg-white px-4 py-3 text-base text-black outline-none transition focus:border-black sm:w-52" value="0" />
        <span class="text-sm text-black/55">THB</span>
        <button type="button" data-fee-item-remove class="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/15 bg-white text-lg leading-none text-black/70 transition hover:border-black/30" aria-label="Remove item" title="Remove">×</button>
      </div>
    `;
    row.querySelector("[data-fee-item-amount]").addEventListener("input", calculateAll);
    row.querySelector("[data-fee-item-remove]").addEventListener("click", () => {
      row.remove();
      calculateAll();
    });
    list.appendChild(row);
    calculateAll();
  }

  function readDesignFeesTotals(totalConstructionCost) {
    const percent = toNum(qs("designFeePercentInput")?.value);
    updateFeeZoneHighlight(percent);
    const designFee = Math.round((percent / 100) * totalConstructionCost);
    setText("designFeeAmountText", `Design Fee: ${fmtBaht(designFee)}`);

    const requires = !!qs("requiresSubmissionToggle")?.checked;
    setHidden("submissionFieldsWrap", !requires);

    const submission = requires ? toNum(qs("submissionFeeInput")?.value) : 0;
    const structural = requires ? toNum(qs("structEngFeeInput")?.value) : 0;
    const consultants = requires ? toNum(qs("consultantFeesInput")?.value) : 0;
    const additional = getFeeItemsSubtotal();

    setText("feeItemsSubtotalText", fmtBaht(additional));

    setText("summaryDesignFeeText", fmtBaht(designFee));
    setText("summarySubmissionFeeText", fmtBaht(submission));
    setText("summaryStructEngText", fmtBaht(structural));
    setText("summaryConsultantsText", fmtBaht(consultants));
    setText("summaryAdditionalItemsText", fmtBaht(additional));

    const total = designFee + submission + structural + consultants + additional;
    setText("summaryTotalDesignFeesText", fmtBaht(total));
    return { totalDesignFees: total, designFee };
  }

  function ensureDesignFeeDefaults() {
    const subFee = qs("submissionFeeInput");
    const structFee = qs("structEngFeeInput");
    const consultants = qs("consultantFeesInput");
    const suggested = Math.round(getProjectAreaSqm() * 1000);
    setText("structEngSuggestedText", suggested > 0 ? fmtBaht(suggested) : "—");

    if (subFee && !subFee.value) subFee.value = "10000";
    if (consultants && !consultants.value) consultants.value = "0";
    if (structFee && !structFee.value && suggested > 0) structFee.value = String(suggested);
  }

  function readFirstBudgetTHB() {
    const amount = toNum(qs("clientBudgetInput")?.value);
    const currency = qs("currencySelect")?.value || "THB";
    // For now, treat non-THB as 0 (no FX logic requested). Keeps bugs from showing wrong conversions.
    if (currency !== "THB") return 0;
    return amount;
  }

  function selectOptionText(selectId) {
    const sel = qs(selectId);
    if (!sel) return "—";
    const opt = sel.selectedOptions[0];
    if (!opt || opt.disabled) return "—";
    const t = opt.textContent.trim();
    return t || "—";
  }

  function renderResultsInputSummary(projectType, designTotals) {
    const root = qs("resultsInputsSummaryRoot");
    if (!root) return;

    root.replaceChildren();
    const data = window.ARCHCALC_DATA;

    function addSection(titleText) {
      const sec = document.createElement("div");
      sec.className = "archcalc-results-summary-section";
      const h = document.createElement("h4");
      h.className = "archcalc-results-summary-title";
      h.textContent = titleText;
      sec.appendChild(h);
      const ul = document.createElement("ul");
      ul.className = "archcalc-results-summary-list";
      sec.appendChild(ul);
      root.appendChild(sec);
      return ul;
    }

    function addLine(ul, label, value) {
      const li = document.createElement("li");
      li.className = "archcalc-results-summary-row";
      const lb = document.createElement("span");
      lb.className = "archcalc-results-summary-label";
      lb.textContent = label;
      const val = document.createElement("span");
      val.className = "archcalc-results-summary-value";
      val.textContent = value;
      li.appendChild(lb);
      li.appendChild(val);
      ul.appendChild(li);
    }

    const ul1 = addSection(STEP_META[0].title);
    const nameRaw = (qs("projectNameInput")?.value || "").trim();
    addLine(ul1, "Project name", nameRaw || "Untitled project");
    addLine(ul1, "Project type", selectOptionText("projectType"));
    const areaRaw = toNum(qs("projectAreaInput")?.value);
    const unitLabel = qs("areaUnitSelect")?.selectedOptions[0]?.textContent?.trim() || "sqm";
    addLine(ul1, "Project area", `${nf0.format(areaRaw)} ${unitLabel}`);
    addLine(ul1, "Structure type", selectOptionText("structureType"));
    addLine(ul1, "Building form", selectOptionText("buildingForm"));
    addLine(ul1, "Site location", selectOptionText("siteLocation"));
    addLine(ul1, "Currency", qs("currencySelect")?.value || "THB");
    addLine(ul1, "Client's first budget", fmtBaht(toNum(qs("clientBudgetInput")?.value)));

    const ul2 = addSection(STEP_META[1].title);
    getScopeConfig().forEach((s) => {
      const scopeLabel = data?.SCOPE_LABELS?.[s.id] || s.id;
      const enabled = qs(s.enabled)?.checked;
      if (!enabled) {
        addLine(ul2, scopeLabel, "Not included");
        return;
      }
      const area = toNum(qs(s.area)?.value);
      const rate = toNum(qs(s.rate)?.value);
      const sub = area * rate;
      const useDefault = qs(s.modeDefault)?.checked;
      const modeText = useDefault ? "Default rate" : "Custom rate";
      addLine(
        ul2,
        scopeLabel,
        `Included — ${nf0.format(area)} sqm — ${modeText} — ${nf0.format(rate)} THB/sqm — subtotal ${fmtBaht(sub)}`
      );
    });

    const ul3 = addSection(STEP_META[2].title);
    const opsCfg = getOperationsConfig(projectType, { skipDom: true });
    opsCfg.forEach((c) => {
      const on = qs(c.enabled)?.checked;
      const amt = toNum(qs(c.amount)?.value);
      addLine(ul3, c.id, on ? fmtBaht(amt) : "Not included");
    });
    const customList = qs("opsCustomList");
    if (customList) {
      Array.from(customList.querySelectorAll("[data-ops-item-row]")).forEach((row) => {
        const labelEl = row.querySelector("[data-ops-item-label]");
        const amtEl = row.querySelector("[data-ops-item-amount]");
        const label = (labelEl && labelEl.value.trim()) || "Custom item";
        const amt = toNum(amtEl && amtEl.value);
        addLine(ul3, label, fmtBaht(amt));
      });
    }

    const ul4 = addSection(STEP_META[3].title);
    const pct = toNum(qs("designFeePercentInput")?.value);
    addLine(ul4, "Design fee", `${pct}% of construction — ${fmtBaht(designTotals.designFee)}`);
    const requires = !!qs("requiresSubmissionToggle")?.checked;
    addLine(ul4, "Authority submission", requires ? "Yes" : "No");
    if (requires) {
      addLine(ul4, "Submission fee", fmtBaht(toNum(qs("submissionFeeInput")?.value)));
      addLine(ul4, "Structural engineering", fmtBaht(toNum(qs("structEngFeeInput")?.value)));
      addLine(ul4, "Other consultants", fmtBaht(toNum(qs("consultantFeesInput")?.value)));
    }
    const feeList = qs("feeItemsList");
    let extraCount = 0;
    if (feeList) {
      Array.from(feeList.querySelectorAll("[data-fee-item-row]")).forEach((row) => {
        const labelEl = row.querySelector("[data-fee-item-label]");
        const amtEl = row.querySelector("[data-fee-item-amount]");
        const label = (labelEl && labelEl.value.trim()) || "Additional item";
        const amt = toNum(amtEl && amtEl.value);
        extraCount += 1;
        addLine(ul4, label, fmtBaht(amt));
      });
    }
    if (extraCount === 0) addLine(ul4, "Additional fee items", "None");
    addLine(ul4, "Total design & fees", fmtBaht(designTotals.totalDesignFees));
  }

  function initLiveBudgetChart() {
    const canvas = qs("liveBudgetPieCanvas");
    if (!canvas || typeof window.Chart === "undefined" || liveBudgetChart) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    liveBudgetChart = new window.Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Construction", "Operations", "Design & fees"],
        datasets: [
          {
            data: [1, 1, 1],
            backgroundColor: ["#8B7355", "#C4A77D", "#6B8E6B"],
            borderWidth: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw || 0;
                return `${ctx.label}: ${fmtBaht(v)}`;
              }
            }
          }
        },
        cutout: "58%"
      }
    });
  }

  function updateLiveDashboard() {
    const c = lastDashboardTotals.scope;
    const o = lastDashboardTotals.ops;
    const d = lastDashboardTotals.design;
    const firstBudget = lastDashboardTotals.firstBudget;

    const nameEl = qs("liveProjectNameDisplay");
    if (nameEl) {
      const raw = (qs("projectNameInput")?.value || "").trim();
      nameEl.textContent = raw || "Untitled project";
    }

    const areaEl = qs("liveProjectAreaDisplay");
    if (areaEl) {
      const areaRaw = toNum(qs("projectAreaInput")?.value);
      const unitLabel = qs("areaUnitSelect")?.selectedOptions[0]?.textContent?.trim() || "sqm";
      areaEl.textContent = areaRaw > 0 ? `${nf0.format(areaRaw)} ${unitLabel}` : "—";
    }

    const incScope = qs("includeScopeInLive")?.checked !== false;
    const incOps = qs("includeOpsInLive")?.checked !== false;
    const incDesign = qs("includeDesignInLive")?.checked !== false;

    const adjusted = (incScope ? c : 0) + (incOps ? o : 0) + (incDesign ? d : 0);
    setText("liveAdjustedTotalText", fmtBaht(adjusted));

    const hint = qs("liveToggleHint");
    if (hint) hint.classList.toggle("hidden", incScope && incOps && incDesign);

    const sC = incScope ? c : 0;
    const sO = incOps ? o : 0;
    const sD = incDesign ? d : 0;
    const sliceSum = sC + sO + sD;

    if (liveBudgetChart) {
      const palette = ["#8B7355", "#C4A77D", "#6B8E6B"];
      if (sliceSum <= 0) {
        liveBudgetChart.data.datasets[0].data = [1, 1, 1];
        liveBudgetChart.data.datasets[0].backgroundColor = palette.map((hex) => `${hex}40`);
      } else {
        liveBudgetChart.data.datasets[0].data = [sC, sO, sD];
        liveBudgetChart.data.datasets[0].backgroundColor = palette;
      }
      liveBudgetChart.update();
    }

    const gapSel = adjusted - firstBudget;
    const gapSelEl = qs("liveSelectedVarianceText");
    if (gapSelEl) {
      gapSelEl.classList.remove("text-red-600", "text-green-600");
      if (gapSel > 0) {
        gapSelEl.classList.add("text-red-600");
        gapSelEl.textContent = `Over budget by ${fmtBaht(gapSel)}`;
      } else {
        gapSelEl.classList.add("text-green-600");
        gapSelEl.textContent = `Within budget by ${fmtBaht(Math.abs(gapSel))}`;
      }
    }
  }

  let currentStep = 1;

  function showForm() {
    const hero = qs("heroSection");
    const form = qs("stepOneSection");
    hero?.classList.add("-translate-x-10", "opacity-0", "pointer-events-none");
    form?.classList.remove("translate-x-full", "opacity-0", "pointer-events-none");
    form?.removeAttribute("aria-hidden");
  }

  function showHero() {
    const hero = qs("heroSection");
    const form = qs("stepOneSection");
    hero?.classList.remove("-translate-x-10", "opacity-0", "pointer-events-none");
    form?.classList.add("translate-x-full", "opacity-0", "pointer-events-none");
    form?.setAttribute("aria-hidden", "true");
    currentStep = 1;
    updateProgressUi(currentStep);
  }

  function calculateAll() {
    // Step 2 (construction scopes)
    ensureScopeDefaults();
    const scopeTotals = readScopeTotals();
    renderSummaryList("scopeSummaryList", scopeTotals.rows);
    setText("totalScopeCostText", fmtBaht(scopeTotals.total));

    // Step 3 (operations)
    const projectType = qs("projectType")?.value || "Other";
    ensureOpsDefaults(projectType);
    const opsTotals = readOperationsTotals(projectType);
    renderSummaryList("opsSummaryList", opsTotals.rows);
    setText("totalOpsCostText", fmtBaht(opsTotals.total));

    // Step 4 (design & fees)
    ensureDesignFeeDefaults();
    const designTotals = readDesignFeesTotals(scopeTotals.total);

    setText("resultsScopeTotalText", fmtBaht(scopeTotals.total));
    setText("resultsOpsTotalText", fmtBaht(opsTotals.total));
    setText("resultsDesignFeesTotalText", fmtBaht(designTotals.totalDesignFees));

    const grand = scopeTotals.total + opsTotals.total + designTotals.totalDesignFees;
    setText("resultsGrandTotalText", fmtBaht(grand));

    const firstBudget = readFirstBudgetTHB();
    setText("resultsFirstBudgetText", fmtBaht(firstBudget));

    lastDashboardTotals = {
      scope: scopeTotals.total,
      ops: opsTotals.total,
      design: designTotals.totalDesignFees,
      grand,
      firstBudget
    };

    const gap = grand - firstBudget;
    const gapEl = qs("resultsGapText");
    if (gapEl) {
      gapEl.classList.remove("text-red-600", "text-green-600");
      if (gap > 0) {
        gapEl.classList.add("text-red-600");
        gapEl.textContent = `Over budget by ${fmtBaht(gap)}`;
      } else {
        gapEl.classList.add("text-green-600");
        gapEl.textContent = `Within budget by ${fmtBaht(Math.abs(gap))}`;
      }
    }

    renderResultsInputSummary(projectType, designTotals);
    updateLiveDashboard();
  }

  function wireEvents() {
    qs("startCalculationBtn")?.addEventListener("click", () => {
      showForm();
      updateProgressUi(currentStep);
      calculateAll();
    });

    qs("backToHeroBtn")?.addEventListener("click", () => {
      if (currentStep > 1) {
        currentStep -= 1;
        updateProgressUi(currentStep);
        calculateAll();
        return;
      }
      showHero();
    });

    qs("nextStepBtn")?.addEventListener("click", () => {
      if (currentStep < STEP_META.length) {
        currentStep += 1;
        updateProgressUi(currentStep);
        calculateAll();
      }
    });

    getStepDots().forEach((dot) => {
      dot.addEventListener("click", () => {
        const n = Number.parseInt(dot.getAttribute("data-step-dot") || "0", 10);
        if (!Number.isFinite(n) || n < 1 || n > STEP_META.length) return;
        currentStep = n;
        updateProgressUi(currentStep);
        calculateAll();
      });
    });

    ["includeScopeInLive", "includeOpsInLive", "includeDesignInLive"].forEach((id) => {
      qs(id)?.addEventListener("change", updateLiveDashboard);
    });

    qs("projectNameInput")?.addEventListener("input", updateLiveDashboard);

    // unit convert
    const unit = qs("areaUnitSelect");
    if (unit) {
      unit.dataset.previousUnit = unit.value;
      unit.addEventListener("change", (e) => {
        const prev = e.currentTarget.dataset.previousUnit || "sqm";
        const next = e.currentTarget.value;
        convertAreaValue(prev, next);
        e.currentTarget.dataset.previousUnit = next;
        calculateAll();
      });
    }

    // Step 1 inputs that affect defaults
    ["projectType", "projectAreaInput", "siteLocation", "clientBudgetInput"].forEach((id) =>
      qs(id)?.addEventListener("input", calculateAll)
    );
    ["projectType", "siteLocation", "currencySelect"].forEach((id) => qs(id)?.addEventListener("change", calculateAll));

    // scopes
    getScopeConfig().forEach((s) => {
      qs(s.enabled)?.addEventListener("change", calculateAll);
      qs(s.area)?.addEventListener("input", calculateAll);
      qs(s.rate)?.addEventListener("input", calculateAll);
      qs(s.modeDefault)?.addEventListener("change", calculateAll);
      qs(s.modeOwn)?.addEventListener("change", calculateAll);
    });

    // operations toggles/amounts
    [
      "ops_furniture_enabled",
      "ops_kitchen_enabled",
      "ops_pos_enabled",
      "ops_signage_enabled",
      "ops_cleaning_enabled",
      "ops_franchise_enabled",
      "ops_preopen_enabled"
    ].forEach((id) => qs(id)?.addEventListener("change", calculateAll));
    [
      "ops_furniture_amount",
      "ops_kitchen_amount",
      "ops_pos_amount",
      "ops_signage_amount",
      "ops_cleaning_amount",
      "ops_franchise_amount",
      "ops_preopen_amount"
    ].forEach((id) => qs(id)?.addEventListener("input", calculateAll));

    qs("addOpsItemBtn")?.addEventListener("click", addOpsItemRow);

    // design & fees
    ["designFeePercentInput", "requiresSubmissionToggle", "submissionFeeInput", "structEngFeeInput", "consultantFeesInput"].forEach((id) => {
      qs(id)?.addEventListener(id.endsWith("Toggle") ? "change" : "input", calculateAll);
    });
    qs("addFeeItemBtn")?.addEventListener("click", addFeeItemRow);
  }

  function init() {
    initLiveBudgetChart();
    updateProgressUi(currentStep);
    wireEvents();
    calculateAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.ARCHCALC = { calculateAll };
})();
