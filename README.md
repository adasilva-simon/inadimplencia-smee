# 📊 Controle de Inadimplência — SMEE Finance

Sistema web para controle de inadimplência com upload direto de relatórios exportados do SAP.  
Sem backend, sem banco de dados, sem licenças — rode direto no navegador ou hospede no GitHub Pages.

---

## ✨ Funcionalidades

| Recurso | Descrição |
|---|---|
| **Upload SAP** | Arraste ou selecione o arquivo `.xlsx` exportado do SAP (FBL5N ou equivalente) |
| **Dashboard** | Métricas em tempo real: total em aberto, vencido, crítico (+90d), gráficos por faixa e estado |
| **Lista completa** | Tabela filtrável por cliente, UF, faixa de atraso e status. Ordenação por qualquer coluna |
| **Top Devedores** | Ranking dos maiores devedores com barra de proporção |
| **Por Estado** | Cards com valor vencido por UF |
| **Exportar CSV** | Gera relatório filtrado pronto para Excel com um clique |

---

## 🚀 Como usar

### Opção 1 — GitHub Pages (recomendado)

1. Faça fork deste repositório
2. Vá em **Settings → Pages → Source → main / root**
3. Aguarde ~1 min e acesse `https://SEU-USUARIO.github.io/inadimplencia-smee/`

### Opção 2 — Rodar localmente

```bash
# Clone o repositório
git clone https://github.com/SEU-USUARIO/inadimplencia-smee.git
cd inadimplencia-smee

# Abra com qualquer servidor HTTP local
# Python 3:
python -m http.server 8080

# Node.js (npx):
npx serve .

# Depois abra: http://localhost:8080
```

> **Nota:** Abrir o `index.html` direto com `file://` pode bloquear o carregamento do XLSX. Use um servidor HTTP local.

---

## 📁 Estrutura do projeto

```
inadimplencia-smee/
├── index.html      # Página principal (todo o HTML / estrutura)
├── style.css       # Estilos completos (responsivo)
├── app.js          # Lógica: upload, parse, filtros, gráficos, export
└── README.md       # Este arquivo
```

---

## 📋 Formato do relatório SAP

O sistema detecta automaticamente as colunas abaixo (case-insensitive):

| Coluna SAP | Campo interno | Obrigatório |
|---|---|---|
| `Referência` | Nº Documento | — |
| `Cliente` | Código do cliente | — |
| `Nome 1` | Razão social | — |
| `Rg` | Estado/UF | — |
| `Data doc.` | Data de emissão | — |
| `Vencim.em` | **Data de vencimento** | ✅ |
| `Mont.em MI` | **Valor em aberto (R$)** | ✅ |
| `Texto` | Observações de cobrança | — |

> Registros com valor zero ou negativo são automaticamente ignorados (créditos, devoluções).

---

## 🎨 Faixas de atraso

| Faixa | Cor | Descrição |
|---|---|---|
| No prazo | 🟢 Verde | Vencimento futuro |
| 1–30 dias | 🟡 Amarelo | Atraso inicial |
| 31–60 dias | 🟠 Âmbar | Atenção |
| 61–90 dias | 🟠 Âmbar escuro | Crítico |
| 91–180 dias | 🔴 Vermelho | Cobrança urgente |
| +180 dias | 🔴 Vermelho escuro | Jurídico/Write-off |

---

## 🏗️ Tecnologias

- **HTML5 / CSS3 / JavaScript** puro — zero dependências de build
- **[SheetJS (xlsx)](https://sheetjs.com/)** — leitura de arquivos Excel
- **[Chart.js 4](https://www.chartjs.org/)** — gráficos
- Hospedagem: **GitHub Pages** (gratuito)

---

## 🔒 Privacidade

Todos os dados são processados **localmente no navegador**. Nenhuma informação é enviada para servidores externos.

---

## 📄 Licença

MIT — use livremente, inclusive internamente na empresa.
