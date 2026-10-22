import { calculateTax } from "./calculator.js";
import { TAX_RULES } from "./tax-config.js";

const form = document.querySelector("#tax-form");
const moneyFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const currency = (value) => `${moneyFormatter.format(value)} บาท`;
const rate = (value) => `${moneyFormatter.format(value * 100)}%`;
const byId = (id) => document.getElementById(id);
const capText = (key) => {
  const cap = TAX_RULES.deductions[key]?.cap;
  return cap === null || cap === undefined ? TAX_RULES.officialVerification : `${moneyFormatter.format(cap)} บาท`;
};

byId("tax-year").textContent = TAX_RULES.taxYear;
byId("updated-at").textContent = TAX_RULES.updatedAt;
byId("salary-expense-rate").textContent = rate(TAX_RULES.salaryExpense.rate);
byId("salary-expense-cap").textContent = currency(TAX_RULES.salaryExpense.cap);
document.querySelectorAll(".tax-year-inline").forEach((element) => { element.textContent = TAX_RULES.taxYear; });
document.querySelectorAll("[data-cap]").forEach((element) => { element.textContent = capText(element.dataset.cap); });
byId("personal-preview").textContent = currency(TAX_RULES.deductions.personal.cap);

function readMoney(id) {
  const input = byId(id);
  try {
    return parseMoney(input.value);
  } catch (cause) {
    input.setAttribute("aria-invalid", "true");
    throw cause;
  }
}

function readInput() {
  const salaryMonths = readMoney("salary-months");
  if (!Number.isInteger(salaryMonths) || salaryMonths > 12) {
    byId("salary-months").setAttribute("aria-invalid", "true");
    throw new RangeError("จำนวนเดือนที่ได้รับเงินเดือนต้องเป็นจำนวนเต็มระหว่าง 0 ถึง 12 เดือน");
  }
  return {
    salaryPerMonth: readMoney("salary-per-month"),
    salaryMonths,
    bonus: readMoney("bonus"),
    commission: readMoney("commission"),
    overtime: readMoney("overtime"),
    otherIncome: readMoney("other-income"),
    withholding: readMoney("withholding"),
    socialSecurity: readMoney("social-security"),
    supportedParents: Number(byId("supported-parents").value),
    children: [...document.querySelectorAll("[data-child-year]")]
      .map((input, index) => {
        const value = input.value.trim();
        if (value === "") return null;
        const year = Number(value);
        if (!Number.isInteger(year) || year < 1900 || year > TAX_RULES.taxYear) {
          input.setAttribute("aria-invalid", "true");
          throw new RangeError(`ปีเกิดบุตรคนที่ ${index + 1} ไม่ถูกต้อง`);
        }
        return year;
      })
      .filter((year) => year !== null),
    otherDeductions: [...document.querySelectorAll("[data-other-row]")].map((row) => ({
      name: row.querySelector("[data-other-name]").value,
      amount: readDynamicMoney(row.querySelector("[data-other-amount]")),
    })),
    deductions: {
      spouseWithoutIncome: byId("spouse").checked,
      lifeInsurance: readMoney("life-insurance"),
      healthInsurance: readMoney("health-insurance"),
      parentHealthInsurance: readMoney("parent-health-insurance"),
      providentFund: readMoney("provident-fund"),
      governmentPensionFund: readMoney("government-pension-fund"),
      retirementFund: readMoney("retirement-fund"),
      savingsFund: readMoney("savings-fund"),
      homeLoanInterest: readMoney("home-loan-interest"),
      generalDonation: readMoney("general-donation"),
      doubleDonation: readMoney("double-donation"),
      yearlyMeasure: readMoney("yearly-measure"),
    },
  };
}

function readDynamicMoney(input) {
  try {
    return parseMoney(input.value);
  } catch (cause) {
    input.setAttribute("aria-invalid", "true");
    throw cause;
  }
}

function parseMoney(value) {
  const formatted = value.trim();
  if (formatted === "") return 0;
  if (formatted.startsWith("-")) throw new RangeError("จำนวนเงินต้องเป็นศูนย์หรือมากกว่า");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?$/.test(formatted)) {
    throw new RangeError("กรุณากรอกตัวเลขและใช้ comma คั่นหลักพันให้ถูกต้อง");
  }
  const raw = formatted.replaceAll(",", "");
  return Number(raw);
}

function renderBreakdown(rows) {
  const body = byId("bracket-rows");
  body.replaceChildren(...rows.map((bracket) => {
    const row = document.createElement("tr");
    const limit = Number.isFinite(bracket.to) ? moneyFormatter.format(bracket.to) : "ขึ้นไป";
    const lower = bracket.from === 0 ? "0" : moneyFormatter.format(bracket.from + 1);
    const values = [`${lower}–${limit}`, currency(bracket.taxableIncome), rate(bracket.rate), currency(bracket.tax)];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    return row;
  }));
}

function renderChart(result) {
  const rows = [
    { label: "รายได้รวม", value: result.grossIncome, className: "" },
    { label: "ค่าใช้จ่าย", value: result.salaryExpense, className: "expense" },
    { label: "ค่าลดหย่อน", value: result.deductionTotal, className: "deduction" },
    { label: "เงินได้สุทธิ", value: result.taxableIncome, className: "taxable" },
    { label: "ภาษีคำนวณได้", value: result.tax, className: "tax" },
  ];
  const maxValue = Math.max(result.grossIncome, 1);
  const chart = byId("summary-chart");
  chart.replaceChildren(...rows.map(({ label, value, className }) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    const labelElement = document.createElement("span");
    labelElement.className = "chart-label";
    labelElement.textContent = label;
    const track = document.createElement("span");
    track.className = "chart-track";
    const bar = document.createElement("span");
    bar.className = `chart-bar ${className}`;
    bar.style.display = "block";
    bar.style.width = `${Math.min(100, value / maxValue * 100)}%`;
    track.append(bar);
    const amount = document.createElement("span");
    amount.className = "chart-value";
    amount.textContent = currency(value);
    row.append(labelElement, track, amount);
    return row;
  }));
}

function renderWarnings(warnings) {
  const panel = byId("warnings-panel");
  const list = byId("warnings-list");
  panel.hidden = warnings.length === 0;
  list.replaceChildren(...warnings.map((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    return item;
  }));
}

function renderDeductionImpacts(items) {
  const container = byId("deduction-impacts");
  if (items.length === 0) {
    container.textContent = "กรอกค่าลดหย่อนเพื่อดูผลประหยัดภาษีโดยประมาณ";
    container.className = "deduction-impacts empty-list";
    return;
  }
  container.className = "deduction-impacts";
  container.replaceChildren(...items.map((item) => {
    const row = document.createElement("div");
    row.className = "impact-row";
    const description = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = item.label;
    const amount = document.createElement("small");
    amount.textContent = `ใช้ลดหย่อน ${currency(item.amount)}`;
    description.append(label, amount);
    const savings = document.createElement("span");
    savings.className = "impact-value";
    savings.textContent = `−${currency(item.estimatedTaxSaving)}`;
    row.append(description, savings);
    return row;
  }));
}

function calculate() {
  const error = byId("error-message");
  form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute("aria-invalid"));
  error.hidden = true;
  error.textContent = "";
  try {
    const result = calculateTax(readInput());
    byId("gross-result").textContent = currency(result.grossIncome);
    byId("expense-result").textContent = currency(result.salaryExpense);
    byId("deduction-result").textContent = currency(result.deductionTotal);
    byId("taxable-result").textContent = currency(result.taxableIncome);
    byId("tax-result").textContent = currency(result.tax);
    byId("withholding-result").textContent = currency(result.withholding);
    byId("highest-rate").textContent = rate(result.highestRate);
    byId("average-rate").textContent = rate(result.averageRate);
    byId("monthly-tax").textContent = currency(result.monthlyTax);
    byId("salary-expense-preview").textContent = currency(result.salaryExpense);

    const balanceCard = byId("balance-card");
    balanceCard.classList.toggle("refund", result.balance < 0);
    balanceCard.classList.toggle("due", result.balance > 0);
    byId("balance-label").textContent = result.balance < 0
      ? "ประมาณการภาษีที่อาจได้รับคืน"
      : result.balance > 0 ? "ประมาณการภาษีที่ต้องจ่ายเพิ่ม" : "ไม่มีภาษีต้องจ่ายเพิ่มจากยอดหัก ณ ที่จ่าย";
    byId("balance-value").textContent = currency(Math.abs(result.balance));
    byId("balance-caption").textContent = result.balance < 0
      ? "ยอดจริงขึ้นกับการตรวจสอบสิทธิและการยื่นแบบ"
      : result.balance > 0 ? "ยอดจริงขึ้นกับการตรวจสอบสิทธิและการยื่นแบบ" : "ภาษีคำนวณได้ใกล้เคียงยอดหัก ณ ที่จ่าย";

    renderBreakdown(result.breakdown);
    renderDeductionImpacts(result.deductionDetails);
    renderChart(result);
    renderWarnings(result.warnings);
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
    error.hidden = false;
  }
}

function formatNumericInput(input) {
  if (!input.value.trim()) return;
  let value;
  try {
    value = parseMoney(input.value);
  } catch {
    return;
  }
  if (Number.isFinite(value)) input.value = moneyFormatter.format(value);
}

function addChild(year = "") {
  const row = document.createElement("div");
  row.className = "dynamic-row child-row";
  const label = document.createElement("label");
  const yearInput = document.createElement("input");
  const inputId = `child-year-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  label.htmlFor = inputId;
  label.textContent = "ปีเกิดบุตร";
  yearInput.id = inputId;
  yearInput.type = "text";
  yearInput.inputMode = "numeric";
  yearInput.autocomplete = "off";
  yearInput.placeholder = `เช่น ${TAX_RULES.taxYear - 8}`;
  yearInput.value = year;
  yearInput.dataset.childYear = "";
  yearInput.setAttribute("aria-label", "ปีเกิดบุตร");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "ลบบุตร");
  remove.addEventListener("click", () => { row.remove(); calculate(); });
  row.append(label, yearInput, remove);
  byId("children-list").append(row);
  yearInput.addEventListener("input", calculate);
  yearInput.addEventListener("blur", calculate);
}

function addOtherDeduction(name = "", amount = "") {
  const row = document.createElement("div");
  row.className = "dynamic-row";
  row.dataset.otherRow = "";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "ชื่อรายการ";
  nameInput.value = name;
  nameInput.dataset.otherName = "";
  nameInput.setAttribute("aria-label", "ชื่อค่าลดหย่อนอื่น");
  const amountInput = document.createElement("input");
  amountInput.type = "text";
  amountInput.inputMode = "decimal";
  amountInput.placeholder = "จำนวนเงิน";
  amountInput.value = amount;
  amountInput.dataset.otherAmount = "";
  amountInput.setAttribute("aria-label", "จำนวนเงินค่าลดหย่อนอื่น");
  amountInput.addEventListener("blur", () => formatNumericInput(amountInput));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "ลบค่าลดหย่อนรายการนี้");
  remove.addEventListener("click", () => { row.remove(); calculate(); });
  row.append(nameInput, amountInput, remove);
  byId("other-deductions-list").append(row);
  nameInput.addEventListener("input", calculate);
  amountInput.addEventListener("input", calculate);
}

form.addEventListener("input", (event) => {
  if (event.target.matches('input[type="text"]')) {
    event.target.removeAttribute("aria-invalid");
  }
  calculate();
});
form.addEventListener("change", calculate);
form.addEventListener("focusout", (event) => {
  if (event.target.matches('input[inputmode="decimal"], input[inputmode="numeric"]')) {
    formatNumericInput(event.target);
  }
});
byId("calculate-button").addEventListener("click", calculate);
byId("add-child").addEventListener("click", () => { addChild(); calculate(); });
byId("add-other").addEventListener("click", () => { addOtherDeduction(); calculate(); });
byId("sample-button").addEventListener("click", () => {
  form.reset();
  byId("salary-per-month").value = "40,000";
  byId("salary-months").value = "12";
  byId("bonus").value = "50,000";
  byId("withholding").value = "15,000";
  byId("social-security").value = "9,000";
  byId("children-list").replaceChildren();
  byId("other-deductions-list").replaceChildren();
  calculate();
});
byId("clear-button").addEventListener("click", () => {
  byId("children-list").replaceChildren();
  byId("other-deductions-list").replaceChildren();
  setTimeout(calculate, 0);
});

calculate();
