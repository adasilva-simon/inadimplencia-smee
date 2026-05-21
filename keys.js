/* ============================================================
   SMEE Finance — Gerenciamento de Chaves de Acesso
   
   Para adicionar ou remover chaves, edite o array ACCESS_KEYS.
   Cada entrada pode ter:
     key      : string da chave (obrigatório)
     label    : nome/descrição do usuário (opcional)
     expires  : data de expiração "YYYY-MM-DD" (opcional, null = sem expiração)
   
   Após editar, faça commit no GitHub. As novas chaves entram
   em vigor imediatamente sem nenhuma outra alteração.
   ============================================================ */

const ACCESS_KEYS = [
  {
    key:     'TKKF-4WPS-MEB4-DG6F',
    label:   'Setor Financeiro',
    expires: null
  },
  {
    key:     'JZUA-2HQQ-6Q3T-3M7M',
    label:   'Gerência',
    expires: null
  },
  {
    key:     'JN75-75BN-6NZL-UFZW',
    label:   'Diretoria',
    expires: null
  },
  {
    key:     'QBHY-VA6D-QDP7-7KRH',
    label:   'Acesso Temporário',
    expires: '2025-12-31'
  },
  {
    key:     'M9P7-G7N8-UFCR-2QBW',
    label:   'Acesso Temporário 2',
    expires: '2025-12-31'
  }
];

/* ---- NÃO EDITAR ABAIXO DESTA LINHA ---- */
window.SMEE_KEYS = ACCESS_KEYS;
