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

---

## 🔑 Sistema de Chaves de Acesso

O sistema exige uma **chave de acesso** para ser utilizado. Isso evita que pessoas não autorizadas visualizem os dados financeiros, mesmo que encontrem a URL.

### Como gerenciar chaves

Edite o arquivo **`keys.js`** — é o único arquivo que você precisa modificar:

```js
const ACCESS_KEYS = [
  {
    key:     'XXXX-XXXX-XXXX-XXXX',  // chave de acesso
    label:   'Nome do usuário',        // aparece na tela após o login
    expires: null                      // null = sem expiração | 'YYYY-MM-DD' = expira em
  },
  // adicione quantas entradas quiser...
];
```

Após editar e fazer commit no GitHub, as novas chaves entram em vigor imediatamente.

### Chaves padrão incluídas

| Chave | Perfil | Validade |
|---|---|---|
| `TKKF-4WPS-MEB4-DG6F` | Setor Financeiro | Sem expiração |
| `JZUA-2HQQ-6Q3T-3M7M` | Gerência | Sem expiração |
| `JN75-75BN-6NZL-UFZW` | Diretoria | Sem expiração |
| `QBHY-VA6D-QDP7-7KRH` | Acesso Temporário | 31/12/2025 |
| `M9P7-G7N8-UFCR-2QBW` | Acesso Temporário 2 | 31/12/2025 |

> ⚠️ **Recomendação:** Altere as chaves padrão antes de publicar. Gere novas no site [random.org](https://www.random.org/strings/) ou use qualquer gerador de senha aleatória.

### Proteção anti-força-bruta

- Após **5 tentativas erradas**, o acesso fica bloqueado por **15 minutos**
- O bloqueio é por navegador (localStorage)
- A sessão dura até o navegador ser fechado (sessionStorage)
