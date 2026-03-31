$base = "backend\src\modules\goods-receipts";
 @("$base\dto") | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ };
 @("$base\dto\create-grn-line.dto.ts",
 "$base\dto\create-goods-receipt.dto.ts",
 "$base\dto\update-goods-receipt.dto.ts",
 "$base\goods-receipts.service.ts",
"$base\goods-receipts.controller.ts",
"$base\goods-receipts.module.ts") | ForEach-Object { New-Item -ItemType File -Force -Path $_ }