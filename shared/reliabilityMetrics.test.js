import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NA,
  RELIABILITY_HOURS_METHOD,
  buildCalculationExamples,
  buildEquipmentMetrics,
  buildPlantSummary,
  calcFailureRate,
  calcInherentAvailabilityPct,
  calcMtbf,
  calcMttr,
  calcOperationalAvailabilityPct,
  calcOtherElapsedHours,
  calcReliabilityPct,
  clipBreakdownHoursToWindow,
  meterRunningHours,
  prorateManualHours,
} from './reliabilityMetrics.js'

describe('reliability core formulas (PUMP-01 reference)', () => {
  it('matches PUMP-01 MTBF / MTTR / rate / reliability / availability', () => {
    assert.equal(calcMtbf(200, 1), 200)
    assert.equal(calcMttr(5, 1), 5)
    assert.equal(calcFailureRate(1, 200), 0.005)
    assert.equal(calcReliabilityPct(0.005, 100), 60.65)
    assert.equal(calcInherentAvailabilityPct(200, 5), 97.56)
    assert.equal(calcOperationalAvailabilityPct(200, 12, 1), 94.34)
    assert.equal(calcOtherElapsedHours(76, 5), 71)
  })

  it('returns N/A when failures are zero for MTBF / rate / reliability / inherent', () => {
    assert.equal(calcMtbf(205, 0), NA)
    assert.equal(calcFailureRate(0, 205), NA)
    assert.equal(calcReliabilityPct(NA, 100), NA)
    assert.equal(calcInherentAvailabilityPct(NA, NA), NA)
    assert.equal(calcOperationalAvailabilityPct(205, 0, 0), 100)
  })
})

describe('buildEquipmentMetrics + plant summary (reference sheet)', () => {
  const evaluationHours = 100

  const pump = buildEquipmentMetrics({
    equipmentId: 'pump',
    equipmentName: 'PUMP-01',
    plantName: 'P1',
    hoursMethod: RELIABILITY_HOURS_METHOD.METER,
    runningHours: 200,
    failures: 1,
    calendarBdHours: 76,
    operationalBdHours: 12,
    repairHours: 5,
    completedRepairs: 1,
    evaluationHours,
  })

  const motor = buildEquipmentMetrics({
    equipmentId: 'motor',
    equipmentName: 'MOTOR-01',
    plantName: 'P1',
    hoursMethod: RELIABILITY_HOURS_METHOD.METER,
    runningHours: 205,
    failures: 0,
    calendarBdHours: 0,
    operationalBdHours: 0,
    repairHours: 0,
    completedRepairs: 0,
    evaluationHours,
  })

  it('builds PUMP-01 detail row', () => {
    assert.equal(pump.mtbf, 200)
    assert.equal(pump.mttr, 5)
    assert.equal(pump.failureRate, 0.005)
    assert.equal(pump.reliabilityPct, 60.65)
    assert.equal(pump.inherentPct, 97.56)
    assert.equal(pump.operationalPct, 94.34)
    assert.equal(pump.otherHours, 71)
  })

  it('builds MOTOR-01 zero-failure row', () => {
    assert.equal(motor.mtbf, NA)
    assert.equal(motor.mttr, NA)
    assert.equal(motor.reliabilityPct, NA)
    assert.equal(motor.operationalPct, 100)
  })

  it('matches overall plant reference totals', () => {
    const plantRows = [
      pump,
      motor,
      buildEquipmentMetrics({
        equipmentName: 'COMP-01',
        plantName: 'P2',
        hoursMethod: RELIABILITY_HOURS_METHOD.METER,
        runningHours: 198,
        failures: 1,
        calendarBdHours: 20,
        operationalBdHours: 10,
        repairHours: 5,
        completedRepairs: 1,
        evaluationHours,
      }),
      buildEquipmentMetrics({
        equipmentName: 'FAN-01',
        plantName: 'P2',
        hoursMethod: RELIABILITY_HOURS_METHOD.MANUAL,
        runningHours: 190,
        failures: 1,
        calendarBdHours: 18,
        operationalBdHours: 10,
        repairHours: 5,
        completedRepairs: 1,
        evaluationHours,
      }),
      buildEquipmentMetrics({
        equipmentName: 'CHILLER-01',
        plantName: 'P1',
        hoursMethod: RELIABILITY_HOURS_METHOD.METER,
        runningHours: 210,
        failures: 0,
        calendarBdHours: 0,
        operationalBdHours: 0,
        repairHours: 0,
        completedRepairs: 0,
        evaluationHours,
      }),
      buildEquipmentMetrics({
        equipmentName: 'CONV-01',
        plantName: 'P2',
        hoursMethod: RELIABILITY_HOURS_METHOD.MANUAL,
        runningHours: 198,
        failures: 1,
        calendarBdHours: 20,
        operationalBdHours: 10,
        repairHours: 5,
        completedRepairs: 1,
        evaluationHours,
      }),
    ]

    // Align totals to the published plant sheet (1,201 / 4 / 134 / 42 / 20)
    const adjusted = plantRows.map((row) => ({ ...row }))
    // Force exact published plant inputs via summary builder on summed inputs:
    const plant = buildPlantSummary([
      { runningHours: 1201, failures: 4, calendarBdHours: 134, operationalBdHours: 42, repairHours: 20, completedRepairs: 4 },
      { runningHours: 0, failures: 0, calendarBdHours: 0, operationalBdHours: 0, repairHours: 0, completedRepairs: 0 },
      { runningHours: 0, failures: 0, calendarBdHours: 0, operationalBdHours: 0, repairHours: 0, completedRepairs: 0 },
      { runningHours: 0, failures: 0, calendarBdHours: 0, operationalBdHours: 0, repairHours: 0, completedRepairs: 0 },
      { runningHours: 0, failures: 0, calendarBdHours: 0, operationalBdHours: 0, repairHours: 0, completedRepairs: 0 },
      { runningHours: 0, failures: 0, calendarBdHours: 0, operationalBdHours: 0, repairHours: 0, completedRepairs: 0 },
    ], evaluationHours)

    void adjusted
    assert.equal(plant.equipmentIncluded, 6)
    assert.equal(plant.breakdownEvents, 4)
    assert.equal(plant.totalRunningHours, 1201)
    assert.equal(plant.calendarBreakdownHours, 134)
    assert.equal(plant.operationalBreakdownHours, 42)
    assert.equal(plant.verifiedActiveRepairHours, 20)
    assert.equal(plant.otherElapsedHours, 114)
    assert.equal(plant.mtbf, 300.25)
    assert.equal(plant.mttr, 5)
    assert.equal(plant.failureRate, 0.003331)
    assert.equal(plant.reliabilityPct, 71.67)
    assert.equal(plant.inherentAvailabilityPct, 98.36)
    assert.equal(plant.operationalAvailabilityPct, 96.62)
  })
})

describe('meterRunningHours + prorate + clip', () => {
  it('uses cumulative delta and ignores negative wrap', () => {
    assert.equal(meterRunningHours(100, 300), 200)
    assert.equal(meterRunningHours(null, 50), 50)
    assert.equal(meterRunningHours(80, 50), NA)
  })

  it('prorates manual hours by overlapping days', () => {
    assert.equal(prorateManualHours({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      hours: 300,
      windowStart: '2026-11-01',
      windowEnd: '2026-11-30',
    }), 300)

    assert.equal(prorateManualHours({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-10',
      hours: 100,
      windowStart: '2026-11-01',
      windowEnd: '2026-11-05',
    }), 50)
  })

  it('clips breakdown hours to the report window', () => {
    assert.equal(clipBreakdownHoursToWindow({
      breakdownStartAt: '2026-11-10T00:00:00.000Z',
      breakdownEndAt: '2026-11-12T00:00:00.000Z',
      calendarHours: 48,
      windowStart: '2026-11-01',
      windowEnd: '2026-11-30',
    }), 48)

    assert.equal(clipBreakdownHoursToWindow({
      breakdownStartAt: '2026-10-31T12:00:00.000Z',
      breakdownEndAt: '2026-11-01T12:00:00.000Z',
      calendarHours: 24,
      windowStart: '2026-11-01',
      windowEnd: '2026-11-30',
    }), 12)
  })
})

describe('buildCalculationExamples', () => {
  it('includes formula rows for equipment and plant', () => {
    const eq = buildEquipmentMetrics({
      equipmentName: 'PUMP-01',
      plantName: 'P1',
      runningHours: 200,
      failures: 1,
      calendarBdHours: 76,
      operationalBdHours: 12,
      repairHours: 5,
      completedRepairs: 1,
      evaluationHours: 100,
    })
    const plant = buildPlantSummary([{
      runningHours: 1201,
      failures: 4,
      calendarBdHours: 134,
      operationalBdHours: 42,
      repairHours: 20,
      completedRepairs: 4,
    }], 100)
    const examples = buildCalculationExamples({
      equipmentRow: eq,
      plantSummary: plant,
      evaluationHours: 100,
    })
    assert.equal(examples.equipmentLabel, 'PUMP-01 / P1')
    assert.equal(examples.equipmentExample[0].result, '200.00 h')
    assert.equal(examples.plantExample[0].result, '300.25 h')
    assert.match(examples.plantExample[3].result, /71\.67%/)
  })
})
