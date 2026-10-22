import { TAX_RULES } from "./tax-config.js";

const nonNegative = (value, label) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new RangeError(`${label} ต้องเป็นตัวเลขศูนย์หรือมากกว่า`);
  }
  return number;
};

const capped = (amount, cap) => cap === null ? amount : Math.min(amount, cap);

export function calculateProgressiveTax(taxableIncome, brackets = TAX_RULES.brackets) {
  const income = nonNegative(taxableIncome, "เงินได้สุทธิ");
  let tax = 0;
  let highestRate = 0;
  const breakdown = brackets.map((bracket) => {
    const taxableInBracket = Math.max(0, Math.min(income, bracket.to) - bracket.from);
    const bracketTax = taxableInBracket * bracket.rate;
    if (taxableInBracket > 0) highestRate = bracket.rate;
    tax += bracketTax;
    return {
      from: bracket.from,
      to: bracket.to,
      rate: bracket.rate,
      taxableIncome: taxableInBracket,
      tax: bracketTax,
    };
  });

  return { tax, highestRate, breakdown };
}

export function calculateTax(input, rules = TAX_RULES) {
  const salaryPerMonth = nonNegative(input.salaryPerMonth, "เงินเดือนต่อเดือน");
  const salaryMonths = nonNegative(input.salaryMonths, "จำนวนเดือนที่ได้รับเงินเดือน");
  if (!Number.isInteger(salaryMonths) || salaryMonths > 12) {
    throw new RangeError("จำนวนเดือนที่ได้รับเงินเดือนต้องเป็นจำนวนเต็มระหว่าง 0 ถึง 12 เดือน");
  }

  const salary = salaryPerMonth * salaryMonths;
  const bonus = nonNegative(input.bonus, "โบนัส");
  const commission = nonNegative(input.commission, "ค่าคอมมิชชัน");
  const overtime = nonNegative(input.overtime, "ค่าล่วงเวลา");
  const otherIncome = nonNegative(input.otherIncome, "รายได้อื่น");
  const withholding = nonNegative(input.withholding, "ภาษีหัก ณ ที่จ่าย");
  const socialSecurity = nonNegative(input.socialSecurity, "ประกันสังคม");
  const grossIncome = salary + bonus + commission + overtime + otherIncome;
  const employmentIncome = salary + bonus + commission + overtime;
  const salaryExpense = Math.min(employmentIncome * rules.salaryExpense.rate, rules.salaryExpense.cap);

  const requested = input.deductions ?? {};
  const requestedValue = (name) => nonNegative(requested[name], name);
  const applied = {};
  const warnings = [];

  const apply = (name, amount, cap, label, needsVerification = false) => {
    const eligible = capped(amount, cap);
    applied[name] = eligible;
    if (cap !== null && amount > cap) {
      warnings.push(`${label}: ใช้ลดหย่อนได้ไม่เกิน ${cap.toLocaleString("th-TH")} บาท ระบบจึงจำกัดยอดที่ใช้`);
    }
    if (needsVerification && amount > 0) warnings.push(`${label}: ${rules.officialVerification}`);
    return eligible;
  };

  const personal = apply(
    "personal",
    rules.deductions.personal.cap,
    rules.deductions.personal.cap,
    "ค่าลดหย่อนส่วนตัว",
    rules.deductions.personal.needsVerification,
  );
  const spouse = requested.spouseWithoutIncome
    ? apply("spouse", rules.deductions.spouse.cap, rules.deductions.spouse.cap, "คู่สมรสไม่มีรายได้", rules.deductions.spouse.needsVerification)
    : 0;

  const children = (input.children ?? []).reduce((sum, year, index) => {
    const birthYear = Number(year);
    if (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > rules.taxYear) {
      throw new RangeError(`ปีเกิดบุตรคนที่ ${index + 1} ไม่ถูกต้อง`);
    }
    const childRule = birthYear >= rules.childBirthYearThreshold ? rules.deductions.childFrom2561 : rules.deductions.childBefore2561;
    const amount = childRule.cap;
    return sum + apply(`child${index + 1}`, amount, childRule.cap, `บุตรคนที่ ${index + 1}`, childRule.needsVerification);
  }, 0);

  const parents = nonNegative(input.supportedParents, "จำนวนบิดามารดาที่อุปการะ");
  if (!Number.isInteger(parents) || parents > 4) {
    throw new RangeError("จำนวนบิดามารดาที่อุปการะต้องเป็นจำนวนเต็มระหว่าง 0 ถึง 4 คน");
  }
  let parentDeduction = 0;
  for (let index = 0; index < parents; index += 1) {
    parentDeduction += apply(`parent${index + 1}`, rules.deductions.parent.cap, rules.deductions.parent.cap, `บิดามารดาคนที่ ${index + 1}`, rules.deductions.parent.needsVerification);
  }

  const social = apply("socialSecurity", socialSecurity, rules.deductions.socialSecurity.cap, "ประกันสังคม", rules.deductions.socialSecurity.needsVerification);
  const life = apply("lifeInsurance", requestedValue("lifeInsurance"), rules.deductions.lifeInsurance.cap, "เบี้ยประกันชีวิต", rules.deductions.lifeInsurance.needsVerification);
  const healthRequested = requestedValue("healthInsurance");
  const health = Math.min(
    healthRequested,
    rules.deductions.healthInsurance.cap,
    Math.max(0, rules.deductions.lifeAndHealthCombined.cap - life),
  );
  apply("healthInsurance", healthRequested, health, "เบี้ยประกันสุขภาพ", rules.deductions.healthInsurance.needsVerification);
  if (healthRequested > health) {
    warnings.push(`เบี้ยประกันสุขภาพ: ใช้ลดหย่อนได้ ${health.toLocaleString("th-TH")} บาท ตามเพดานรายรายการและเพดานรวม`);
  }

  const parentHealth = apply("parentHealthInsurance", requestedValue("parentHealthInsurance"), rules.deductions.parentHealthInsurance.cap, "ประกันสุขภาพบิดามารดา", rules.deductions.parentHealthInsurance.needsVerification);
  const provident = apply("providentFund", requestedValue("providentFund"), rules.deductions.providentFund.cap, "กองทุนสำรองเลี้ยงชีพ", rules.deductions.providentFund.needsVerification);
  const governmentFund = apply("governmentPensionFund", requestedValue("governmentPensionFund"), rules.deductions.governmentPensionFund.cap, "กบข.", rules.deductions.governmentPensionFund.needsVerification);
  const retirement = apply("retirementFund", requestedValue("retirementFund"), rules.deductions.retirementFund.cap, "กองทุนเพื่อการเกษียณ (เช่น RMF)", rules.deductions.retirementFund.needsVerification);
  const savingsFund = apply("savingsFund", requestedValue("savingsFund"), rules.deductions.savingsFund.cap, "กองทุนเพื่อการออม", rules.deductions.savingsFund.needsVerification);
  const homeLoan = apply("homeLoanInterest", requestedValue("homeLoanInterest"), rules.deductions.homeLoanInterest.cap, "ดอกเบี้ยกู้ซื้อที่อยู่อาศัย", rules.deductions.homeLoanInterest.needsVerification);

  const yearlyMeasure = apply("yearlyMeasure", requestedValue("yearlyMeasure"), rules.deductions.yearlyMeasure.cap, "มาตรการลดหย่อนพิเศษของปีภาษี", rules.deductions.yearlyMeasure.needsVerification);
  const otherDeductions = (input.otherDeductions ?? []).reduce((sum, item, index) => {
    const label = item.name?.trim() || `ค่าลดหย่อนอื่นรายการที่ ${index + 1}`;
    const amount = nonNegative(item.amount, label);
    return sum + apply(`other${index + 1}`, amount, rules.deductions.other.cap, label, rules.deductions.other.needsVerification);
  }, 0);
  const beforeDonations = grossIncome - salaryExpense - personal - spouse - children - parentDeduction - social - life - health - parentHealth - provident - governmentFund - retirement - savingsFund - homeLoan - yearlyMeasure - otherDeductions;
  const donationLimit = Math.max(0, beforeDonations) * 0.1;
  const doubleDonationInput = requestedValue("doubleDonation");
  const doubleDonation = Math.min(doubleDonationInput * 2, donationLimit);
  apply("doubleDonation", doubleDonationInput, doubleDonation / 2, "เงินบริจาคที่หักได้ 2 เท่า", rules.deductions.doubleDonation.needsVerification);
  const generalDonationInput = requestedValue("generalDonation");
  const generalDonation = Math.min(generalDonationInput, Math.max(0, donationLimit - doubleDonation));
  apply("generalDonation", generalDonationInput, generalDonation, "เงินบริจาคทั่วไป", rules.deductions.generalDonation.needsVerification);
  if (doubleDonationInput * 2 > donationLimit || generalDonationInput > Math.max(0, donationLimit - doubleDonation)) {
    warnings.push("เงินบริจาค: ระบบประมาณเพดานเบื้องต้นจาก 10% ของเงินได้หลังรายการอื่น โปรดตรวจสอบเงื่อนไขและลำดับหักกับกรมสรรพากร");
  }

  const deductionTotal = personal + spouse + children + parentDeduction + social + life + health + parentHealth + provident + governmentFund + retirement + savingsFund + homeLoan + doubleDonation + generalDonation + yearlyMeasure + otherDeductions;
  const taxableIncome = Math.max(0, grossIncome - salaryExpense - deductionTotal);
  const taxResult = calculateProgressiveTax(taxableIncome, rules.brackets);
  const balance = taxResult.tax - withholding;
  const deductionDetails = [
    { label: "ค่าลดหย่อนส่วนตัว", amount: personal },
    { label: "คู่สมรสไม่มีรายได้", amount: spouse },
    ...Object.entries(applied)
      .filter(([key]) => key.startsWith("child"))
      .map(([key, amount], index) => ({ label: `บุตรคนที่ ${index + 1}`, amount })),
    ...Object.entries(applied)
      .filter(([key]) => /^parent\d+$/.test(key))
      .map(([key, amount], index) => ({ label: `บิดามารดาคนที่ ${index + 1}`, amount })),
    { label: "ประกันสังคม", amount: social },
    { label: "เบี้ยประกันชีวิต", amount: life },
    { label: "เบี้ยประกันสุขภาพ", amount: health },
    { label: "ประกันสุขภาพบิดามารดา", amount: parentHealth },
    { label: "กองทุนสำรองเลี้ยงชีพ", amount: provident },
    { label: "กบข.", amount: governmentFund },
    { label: "กองทุนเพื่อการเกษียณ", amount: retirement },
    { label: "กองทุนเพื่อการออม", amount: savingsFund },
    { label: "ดอกเบี้ยกู้ซื้อที่อยู่อาศัย", amount: homeLoan },
    { label: "เงินบริจาคที่หักได้ 2 เท่า", amount: doubleDonation },
    { label: "เงินบริจาคทั่วไป", amount: generalDonation },
    { label: "มาตรการพิเศษของปีภาษี", amount: yearlyMeasure },
    ...(otherDeductions > 0
      ? (input.otherDeductions ?? []).map((item, index) => ({
        label: item.name?.trim() || `ค่าลดหย่อนอื่นรายการที่ ${index + 1}`,
        amount: applied[`other${index + 1}`] ?? 0,
      }))
      : []),
  ].filter((item) => item.amount > 0).map((item) => ({
    ...item,
    estimatedTaxSaving: Math.max(
      0,
      calculateProgressiveTax(Math.min(grossIncome - salaryExpense, taxableIncome + item.amount), rules.brackets).tax - taxResult.tax,
    ),
  }));

  if (employmentIncome > 0 && rules.salaryExpense.needsVerification) warnings.push(`ค่าใช้จ่ายเงินเดือน: ${rules.officialVerification}`);
  if ((life > 0 || health > 0) && rules.deductions.lifeAndHealthCombined.needsVerification) {
    warnings.push(`เพดานรวมเบี้ยประกันชีวิตและสุขภาพ: ${rules.officialVerification}`);
  }

  return {
    grossIncome,
    salaryExpense,
    deductionTotal,
    taxableIncome,
    tax: taxResult.tax,
    withholding,
    balance,
    highestRate: taxResult.highestRate,
    averageRate: grossIncome > 0 ? taxResult.tax / grossIncome : 0,
    monthlyTax: taxResult.tax / 12,
    breakdown: taxResult.breakdown,
    appliedDeductions: applied,
    deductionDetails,
    warnings: [...new Set(warnings)],
  };
}
