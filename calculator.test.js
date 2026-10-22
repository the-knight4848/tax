import test from "node:test";
import assert from "node:assert/strict";
import { calculateProgressiveTax, calculateTax } from "./calculator.js";

const cases = [
  [0, 0],
  [150_000, 0],
  [300_000, 7_500],
  [500_000, 27_500],
  [1_000_000, 115_000],
  [2_000_000, 365_000],
  [5_000_000, 1_265_000],
  [5_000_001, 1_265_000.35],
];

for (const [income, expectedTax] of cases) {
  test(`ภาษีขั้นบันไดของเงินได้สุทธิ ${income.toLocaleString("th-TH")} บาท`, () => {
    assert.equal(calculateProgressiveTax(income).tax, expectedTax);
  });
}

const boundaries = [
  [150_000, 150_001, 0, 5],
  [300_000, 300_001, 5, 10],
  [500_000, 500_001, 10, 15],
  [750_000, 750_001, 15, 20],
  [1_000_000, 1_000_001, 20, 25],
  [2_000_000, 2_000_001, 25, 30],
  [5_000_000, 5_000_001, 30, 35],
];

for (const [at, after, beforeRate, afterRate] of boundaries) {
  test(`จุดเปลี่ยน ${at.toLocaleString("th-TH")} / ${after.toLocaleString("th-TH")} บาท`, () => {
    const atResult = calculateProgressiveTax(at);
    const beforeResult = calculateProgressiveTax(at - 1);
    const afterResult = calculateProgressiveTax(after);
    assert.ok(Math.abs(beforeResult.tax - (atResult.tax - beforeRate / 100)) < 1e-9);
    assert.ok(Math.abs(afterResult.tax - (atResult.tax + afterRate / 100)) < 1e-9);
    assert.equal(atResult.highestRate * 100, beforeRate);
    assert.equal(afterResult.highestRate * 100, afterRate);
  });
}

test("อัตราภาษีเฉลี่ยไม่เกินอัตราภาษีขั้นสูงสุด", () => {
  for (const income of [1, 150_000, 300_001, 700_000, 2_400_000, 8_000_000]) {
    const result = calculateProgressiveTax(income);
    assert.ok(result.tax / income <= result.highestRate);
  }
});

test("คำนวณข้อมูลตัวอย่างตามผลที่คาดหวัง", () => {
  const result = calculateTax({
    salaryPerMonth: 40_000,
    salaryMonths: 12,
    bonus: 50_000,
    withholding: 15_000,
    socialSecurity: 9_000,
  });
  assert.equal(result.grossIncome, 530_000);
  assert.equal(result.salaryExpense, 100_000);
  assert.equal(result.deductionTotal, 69_000);
  assert.equal(result.taxableIncome, 361_000);
  assert.equal(result.tax, 13_600);
  assert.equal(result.balance, -1_400);
  assert.equal(result.deductionDetails.find((item) => item.label === "ค่าลดหย่อนส่วนตัว").estimatedTaxSaving, 6_000);
  assert.equal(result.deductionDetails.find((item) => item.label === "ประกันสังคม").estimatedTaxSaving, 900);
});

test("จำกัดค่าใช้จ่ายและรายการที่มีเพดาน", () => {
  const result = calculateTax({
    salaryPerMonth: 40_000,
    salaryMonths: 12,
    deductions: { lifeInsurance: 150_000, healthInsurance: 30_000 },
  });
  assert.equal(result.appliedDeductions.lifeInsurance, 100_000);
  assert.equal(result.appliedDeductions.healthInsurance, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("ใช้ลดหย่อนได้ไม่เกิน")));
});

test("จำกัดเบี้ยประกันสุขภาพตามเพดานรวมชีวิตและสุขภาพ", () => {
  const result = calculateTax({
    salaryPerMonth: 40_000,
    salaryMonths: 12,
    deductions: { lifeInsurance: 85_000, healthInsurance: 25_000 },
  });
  assert.equal(result.appliedDeductions.lifeInsurance, 85_000);
  assert.equal(result.appliedDeductions.healthInsurance, 15_000);
});

test("ปฏิเสธจำนวนติดลบและจำนวนเดือนเกิน 12", () => {
  assert.throws(() => calculateTax({ salaryPerMonth: -1, salaryMonths: 12 }), /ศูนย์หรือมากกว่า/);
  assert.throws(() => calculateTax({ salaryPerMonth: 1, salaryMonths: 13 }), /จำนวนเต็มระหว่าง 0 ถึง 12 เดือน/);
  assert.throws(() => calculateTax({ salaryPerMonth: 1, salaryMonths: 1.5 }), /จำนวนเต็มระหว่าง 0 ถึง 12 เดือน/);
});
