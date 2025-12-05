# Script para verificar si un PDF tiene bookmarks
# Uso: .\check-pdf-bookmarks.ps1 "ruta\al\archivo.pdf"

param(
    [Parameter(Mandatory=$true)]
    [string]$PdfPath
)

if (-not (Test-Path $PdfPath)) {
    Write-Host "Error: El archivo no existe: $PdfPath" -ForegroundColor Red
    exit 1
}

Write-Host "Verificando bookmarks en: $PdfPath" -ForegroundColor Cyan

# Leer el PDF como binario y buscar patrones de bookmarks
$pdfBytes = [System.IO.File]::ReadAllBytes($PdfPath)
$pdfText = [System.Text.Encoding]::ASCII.GetString($pdfBytes)

# Buscar indicadores de bookmarks en el PDF
# Los bookmarks suelen estar en objetos con /Outlines o /First
$hasOutlines = $pdfText -match '/Outlines'
$hasFirst = $pdfText -match '/First\s+\d+\s+\d+\s+R'
$hasBookmarks = $pdfText -match '/Bookmark'

if ($hasOutlines -or $hasFirst -or $hasBookmarks) {
    Write-Host "✓ El PDF parece tener bookmarks/marcadores" -ForegroundColor Green
    Write-Host "  Indicadores encontrados:" -ForegroundColor Yellow
    if ($hasOutlines) { Write-Host "    - /Outlines encontrado" -ForegroundColor Gray }
    if ($hasFirst) { Write-Host "    - /First encontrado" -ForegroundColor Gray }
    if ($hasBookmarks) { Write-Host "    - /Bookmark encontrado" -ForegroundColor Gray }
    exit 0
} else {
    Write-Host "✗ El PDF NO parece tener bookmarks/marcadores" -ForegroundColor Red
    Write-Host "  (Esto es una verificación básica, puede haber falsos negativos)" -ForegroundColor Yellow
    exit 1
}

