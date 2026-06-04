import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding UOM catalog...');

  // ── UOM Units ──────────────────────────────────────────────────────────────
  const units = [
    // ── Count / Universal ────────────────────────────────────────────────────
    { code: 'PCS',    name: 'Piece',             type: 'count',  system: 'universal', isBase: true,  symbol: 'pcs'   },
    { code: 'UNIT',   name: 'Unit',              type: 'count',  system: 'universal', isBase: false, symbol: 'unit'  },
    { code: 'BOX',    name: 'Box',               type: 'count',  system: 'universal', isBase: false, symbol: 'box'   },
    { code: 'CAJA',   name: 'Caja',              type: 'count',  system: 'universal', isBase: false, symbol: 'cja'   },
    { code: 'KIT',    name: 'Kit',               type: 'count',  system: 'universal', isBase: false, symbol: 'kit'   },
    { code: 'PALLET', name: 'Pallet',            type: 'count',  system: 'universal', isBase: false, symbol: 'plt'   },
    { code: 'DOZEN',  name: 'Dozen',             type: 'count',  system: 'universal', isBase: false, symbol: 'dz'    },

    // ── Volume — Metric ───────────────────────────────────────────────────────
    { code: 'LTR',    name: 'Liter',             type: 'volume', system: 'metric',    isBase: true,  symbol: 'L'     },
    { code: 'ML',     name: 'Milliliter',        type: 'volume', system: 'metric',    isBase: false, symbol: 'mL'    },
    { code: 'M3',     name: 'Cubic Meter',       type: 'volume', system: 'metric',    isBase: false, symbol: 'm³'    },
    { code: 'CM3',    name: 'Cubic Centimeter',  type: 'volume', system: 'metric',    isBase: false, symbol: 'cm³'   },

    // ── Volume — Imperial ─────────────────────────────────────────────────────
    { code: 'GAL',    name: 'Gallon',            type: 'volume', system: 'imperial',  isBase: true,  symbol: 'gal'   },
    { code: 'QT',     name: 'Quart',             type: 'volume', system: 'imperial',  isBase: false, symbol: 'qt'    },
    { code: 'PT',     name: 'Pint',              type: 'volume', system: 'imperial',  isBase: false, symbol: 'pt'    },
    { code: 'FLOZ',   name: 'Fluid Ounce',       type: 'volume', system: 'imperial',  isBase: false, symbol: 'fl oz' },
    { code: 'BRL',    name: 'Barrel (200L)',     type: 'volume', system: 'imperial',  isBase: false, symbol: 'brl'   },
    { code: 'FT3',    name: 'Cubic Foot',        type: 'volume', system: 'imperial',  isBase: false, symbol: 'ft³'   },
    { code: 'YD3',    name: 'Cubic Yard',        type: 'volume', system: 'imperial',  isBase: false, symbol: 'yd³'   },

    // ── Mass — Metric ─────────────────────────────────────────────────────────
    { code: 'KG',     name: 'Kilogram',          type: 'mass',   system: 'metric',    isBase: true,  symbol: 'kg'    },
    { code: 'G',      name: 'Gram',              type: 'mass',   system: 'metric',    isBase: false, symbol: 'g'     },
    { code: 'MG',     name: 'Milligram',         type: 'mass',   system: 'metric',    isBase: false, symbol: 'mg'    },
    { code: 'TON',    name: 'Metric Ton',        type: 'mass',   system: 'metric',    isBase: false, symbol: 't'     },

    // ── Mass — Imperial ───────────────────────────────────────────────────────
    { code: 'LB',     name: 'Pound',             type: 'mass',   system: 'imperial',  isBase: true,  symbol: 'lb'    },
    { code: 'OZ',     name: 'Ounce (weight)',    type: 'mass',   system: 'imperial',  isBase: false, symbol: 'oz'    },

    // ── Length — Metric ───────────────────────────────────────────────────────
    { code: 'M',      name: 'Meter',             type: 'length', system: 'metric',    isBase: true,  symbol: 'm'     },
    { code: 'CM',     name: 'Centimeter',        type: 'length', system: 'metric',    isBase: false, symbol: 'cm'    },
    { code: 'MM',     name: 'Millimeter',        type: 'length', system: 'metric',    isBase: false, symbol: 'mm'    },
    { code: 'KM',     name: 'Kilometer',         type: 'length', system: 'metric',    isBase: false, symbol: 'km'    },

    // ── Length — Imperial ─────────────────────────────────────────────────────
    { code: 'FT',     name: 'Foot',              type: 'length', system: 'imperial',  isBase: true,  symbol: 'ft'    },
    { code: 'IN',     name: 'Inch',              type: 'length', system: 'imperial',  isBase: false, symbol: 'in'    },
    { code: 'YD',     name: 'Yard',              type: 'length', system: 'imperial',  isBase: false, symbol: 'yd'    },
    { code: 'MI',     name: 'Mile',              type: 'length', system: 'imperial',  isBase: false, symbol: 'mi'    },

    // ── Area — Metric ─────────────────────────────────────────────────────────
    { code: 'M2',     name: 'Square Meter',      type: 'area',   system: 'metric',    isBase: true,  symbol: 'm²'    },
    { code: 'CM2',    name: 'Square Centimeter', type: 'area',   system: 'metric',    isBase: false, symbol: 'cm²'   },
    { code: 'KM2',    name: 'Square Kilometer',  type: 'area',   system: 'metric',    isBase: false, symbol: 'km²'   },
    { code: 'HA',     name: 'Hectare',           type: 'area',   system: 'metric',    isBase: false, symbol: 'ha'    },

    // ── Area — Imperial ───────────────────────────────────────────────────────
    { code: 'FT2',    name: 'Square Foot',       type: 'area',   system: 'imperial',  isBase: true,  symbol: 'ft²'   },
    { code: 'IN2',    name: 'Square Inch',       type: 'area',   system: 'imperial',  isBase: false, symbol: 'in²'   },
    { code: 'YD2',    name: 'Square Yard',       type: 'area',   system: 'imperial',  isBase: false, symbol: 'yd²'   },
    { code: 'ACRE',   name: 'Acre',              type: 'area',   system: 'imperial',  isBase: false, symbol: 'ac'    },
    { code: 'MI2',    name: 'Square Mile',        type: 'area',   system: 'imperial',  isBase: false, symbol: 'mi²'   },

    // ── Time — Universal ──────────────────────────────────────────────────────
    // HR is base for routing (matches work center costPerHour)
    { code: 'SEC',    name: 'Second',            type: 'time',   system: 'universal', isBase: false, symbol: 's'     },
    { code: 'MIN',    name: 'Minute',            type: 'time',   system: 'universal', isBase: false, symbol: 'min'   },
    { code: 'HR',     name: 'Hour',              type: 'time',   system: 'universal', isBase: true,  symbol: 'hr'    },
    { code: 'DAY',    name: 'Day',               type: 'time',   system: 'universal', isBase: false, symbol: 'd'     },
    { code: 'WK',     name: 'Week',              type: 'time',   system: 'universal', isBase: false, symbol: 'wk'    },
    { code: 'MON',    name: 'Month (30d)',        type: 'time',   system: 'universal', isBase: false, symbol: 'mo'    },
  ];

  for (const u of units) {
    await prisma.uomUnit.upsert({
      where:  { code: u.code },
      update: { name: u.name, type: u.type, system: u.system, isBase: u.isBase, symbol: u.symbol },
      create: u,
    });
  }
  console.log(`  ✓ ${units.length} UOM units seeded`);

  // ── Get ID helper ──────────────────────────────────────────────────────────
  const get = async (code: string) => {
    const u = await prisma.uomUnit.findUnique({ where: { code } });
    if (!u) throw new Error(`UOM not found: ${code}`);
    return u.id;
  };

  // ── UOM Conversions ────────────────────────────────────────────────────────
  const conversionDefs: [string, string, number][] = [

    // ── Volume: Metric internal ───────────────────────────────────────────────
    ['LTR',  'ML',   1000.0      ],
    ['ML',   'LTR',  0.001       ],
    ['M3',   'LTR',  1000.0      ],
    ['LTR',  'M3',   0.001       ],
    ['CM3',  'ML',   1.0         ],
    ['ML',   'CM3',  1.0         ],
    ['CM3',  'LTR',  0.001       ],
    ['LTR',  'CM3',  1000.0      ],

    // ── Volume: Imperial internal ─────────────────────────────────────────────
    ['GAL',  'QT',   4.0         ],
    ['QT',   'GAL',  0.25        ],
    ['GAL',  'PT',   8.0         ],
    ['PT',   'GAL',  0.125       ],
    ['QT',   'PT',   2.0         ],
    ['PT',   'QT',   0.5         ],
    ['PT',   'FLOZ', 16.0        ],
    ['FLOZ', 'PT',   0.0625      ],
    ['FT3',  'GAL',  7.48052     ],
    ['GAL',  'FT3',  0.13368     ],
    ['YD3',  'FT3',  27.0        ],
    ['FT3',  'YD3',  0.03704     ],
    ['BRL',  'GAL',  52.8344     ],
    ['GAL',  'BRL',  0.01893     ],

    // ── Volume: Metric ↔ Imperial ─────────────────────────────────────────────
    ['GAL',  'LTR',  3.78541     ],
    ['LTR',  'GAL',  0.26417     ],
    ['BRL',  'LTR',  200.000     ],
    ['LTR',  'BRL',  0.00500     ],
    ['QT',   'LTR',  0.94635     ],
    ['LTR',  'QT',   1.05669     ],
    ['PT',   'LTR',  0.47318     ],
    ['LTR',  'PT',   2.11338     ],
    ['FLOZ', 'ML',   29.5735     ],
    ['ML',   'FLOZ', 0.03381     ],
    ['FT3',  'LTR',  28.3168     ],
    ['LTR',  'FT3',  0.03531     ],
    ['YD3',  'LTR',  764.555     ],
    ['LTR',  'YD3',  0.00131     ],

    // ── Mass: Metric internal ─────────────────────────────────────────────────
    ['KG',   'G',    1000.0      ],
    ['G',    'KG',   0.001       ],
    ['KG',   'MG',   1000000.0   ],
    ['MG',   'KG',   0.000001    ],
    ['G',    'MG',   1000.0      ],
    ['MG',   'G',    0.001       ],
    ['TON',  'KG',   1000.0      ],
    ['KG',   'TON',  0.001       ],

    // ── Mass: Imperial internal ───────────────────────────────────────────────
    ['LB',   'OZ',   16.0        ],
    ['OZ',   'LB',   0.0625      ],

    // ── Mass: Metric ↔ Imperial ───────────────────────────────────────────────
    ['KG',   'LB',   2.20462     ],
    ['LB',   'KG',   0.45359     ],
    ['G',    'OZ',   0.03527     ],
    ['OZ',   'G',    28.3495     ],
    ['TON',  'LB',   2204.62     ],
    ['LB',   'TON',  0.000454    ],

    // ── Length: Metric internal ───────────────────────────────────────────────
    ['M',    'CM',   100.0       ],
    ['CM',   'M',    0.01        ],
    ['M',    'MM',   1000.0      ],
    ['MM',   'M',    0.001       ],
    ['CM',   'MM',   10.0        ],
    ['MM',   'CM',   0.1         ],
    ['KM',   'M',    1000.0      ],
    ['M',    'KM',   0.001       ],

    // ── Length: Imperial internal ─────────────────────────────────────────────
    ['FT',   'IN',   12.0        ],
    ['IN',   'FT',   0.08333     ],
    ['YD',   'FT',   3.0         ],
    ['FT',   'YD',   0.33333     ],
    ['MI',   'FT',   5280.0      ],
    ['FT',   'MI',   0.000189    ],
    ['YD',   'IN',   36.0        ],
    ['IN',   'YD',   0.02778     ],

    // ── Length: Metric ↔ Imperial ─────────────────────────────────────────────
    ['M',    'FT',   3.28084     ],
    ['FT',   'M',    0.30480     ],
    ['M',    'IN',   39.3701     ],
    ['IN',   'M',    0.0254      ],
    ['M',    'YD',   1.09361     ],
    ['YD',   'M',    0.9144      ],
    ['KM',   'MI',   0.62137     ],
    ['MI',   'KM',   1.60934     ],
    ['CM',   'IN',   0.39370     ],
    ['IN',   'CM',   2.54        ],
    ['MM',   'IN',   0.03937     ],
    ['IN',   'MM',   25.4        ],

    // ── Area: Metric internal ─────────────────────────────────────────────────
    ['M2',   'CM2',  10000.0     ],
    ['CM2',  'M2',   0.0001      ],
    ['KM2',  'M2',   1000000.0   ],
    ['M2',   'KM2',  0.000001    ],
    ['HA',   'M2',   10000.0     ],
    ['M2',   'HA',   0.0001      ],

    // ── Area: Imperial internal ───────────────────────────────────────────────
    ['FT2',  'IN2',  144.0       ],
    ['IN2',  'FT2',  0.00694     ],
    ['YD2',  'FT2',  9.0         ],
    ['FT2',  'YD2',  0.11111     ],
    ['ACRE', 'FT2',  43560.0     ],
    ['FT2',  'ACRE', 0.000023    ],

    // ── Area: Metric ↔ Imperial ───────────────────────────────────────────────
    ['M2',   'FT2',  10.7639     ],
    ['FT2',  'M2',   0.09290     ],
    ['M2',   'IN2',  1550.00     ],
    ['IN2',  'M2',   0.000645    ],
    ['M2',   'YD2',  1.19599     ],
    ['YD2',  'M2',   0.83613     ],
    ['HA',   'ACRE', 2.47105     ],
    ['ACRE', 'HA',   0.40469     ],
    ['KM2',  'MI2',  0.38610     ],

    // ── Time: internal ────────────────────────────────────────────────────────
    ['SEC',  'MIN',  0.01667     ],
    ['MIN',  'SEC',  60.0        ],
    ['MIN',  'HR',   0.01667     ],
    ['HR',   'MIN',  60.0        ],
    ['SEC',  'HR',   0.000278    ],
    ['HR',   'SEC',  3600.0      ],
    ['HR',   'DAY',  0.04167     ],
    ['DAY',  'HR',   24.0        ],
    ['DAY',  'MIN',  1440.0      ],
    ['MIN',  'DAY',  0.000694    ],
    ['WK',   'DAY',  7.0         ],
    ['DAY',  'WK',   0.14286     ],
    ['WK',   'HR',   168.0       ],
    ['HR',   'WK',   0.00595     ],
    ['MON',  'DAY',  30.0        ],
    ['DAY',  'MON',  0.03333     ],
    ['MON',  'WK',   4.28571     ],
    ['WK',   'MON',  0.23333     ],
    ['MON',  'HR',   720.0       ],
    ['HR',   'MON',  0.001389    ],

    // ── Count: cross-conversions ──────────────────────────────────────────────
    ['DOZEN','PCS',  12.0        ],
    ['PCS',  'DOZEN',0.08333     ],
  ];

  let convCount = 0;
  for (const [from, to, factor] of conversionDefs) {
    const fromId = await get(from);
    const toId   = await get(to);
    await prisma.uomConversion.upsert({
      where:  { fromUomId_toUomId: { fromUomId: fromId, toUomId: toId } },
      update: { factor },
      create: { fromUomId: fromId, toUomId: toId, factor },
    });
    convCount++;
  }
  console.log(`  ✓ ${convCount} UOM conversions seeded`);

  // ── Tenant Settings for demo tenant ───────────────────────────────────────
  // Resolve by code — tenant IDs are environment-specific, never hardcoded
  const demoTenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } });
  if (!demoTenant) {
    console.log('  ⚠ DEMO tenant not found — skipping tenant settings (run main seed first)');
    console.log('\nSeed complete ✓ (catalog only)');
    return;
  }
  const DEMO_TENANT = demoTenant.id;
  const ltrId = await get('LTR');
  const kgId  = await get('KG');
  const mId   = await get('M');
  const pcsId = await get('PCS');
  const m2Id  = await get('M2');
  const hrId  = await get('HR');

  await prisma.tenantSettings.upsert({
    where:  { tenantId: DEMO_TENANT },
    update: {
      volumeBaseUomId:  ltrId,
      massBaseUomId:    kgId,
      lengthBaseUomId:  mId,
      countBaseUomId:   pcsId,
      areaBaseUomId:    m2Id,
    },
    create: {
      tenantId:         DEMO_TENANT,
      defaultUomSystem: 'metric',
      volumeBaseUomId:  ltrId,
      massBaseUomId:    kgId,
      lengthBaseUomId:  mId,
      countBaseUomId:   pcsId,
      areaBaseUomId:    m2Id,
    },
  });
  console.log('  ✓ Demo tenant settings updated (metric: LTR / KG / M / PCS / M2)');
  console.log('    Note: time system UOM not set by default — configure HR/DAY/WK in Settings → General as needed');

  console.log('\nSeed complete ✓');
  console.log('  Units added: volume (CM3, FT3, YD3), area (M2, CM2, KM2, HA, FT2, IN2, YD2, ACRE), time (SEC, MIN, HR, DAY, WK, MON), mass (MG), length (KM, MI)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());