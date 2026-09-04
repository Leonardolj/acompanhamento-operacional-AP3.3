/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

const CONFIG = {
    spreadsheetId: "1y2AFRyrT6PaCM1APOW8CaRmcOXOUQ98homBWmJUUvvg",

    // SOMENTE estas duas abas serão utilizadas
    sheets: [
        "AR CONDICIONADO",
        "ELETRODOMÉSTICOS"
    ],

    dataAnterior: "02/09/2026",
    dataAtual: "03/09/2026"
};


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    carregarDashboard();
});


/* =========================================================
   CARREGAR TODAS AS ABAS PERMITIDAS
   ========================================================= */

async function carregarDashboard() {

    mostrarStatus("Atualizando dados...", "loading");

    try {

        const resultados = await Promise.all(
            CONFIG.sheets.map(nomeAba =>
                carregarAba(nomeAba)
            )
        );

        // Junta somente os dados das duas abas permitidas
        const dados = resultados.flat();

        console.log("Total de registros:", dados.length);

        atualizarIndicadores(dados);

        mostrarStatus(
            `Dados atualizados • ${formatarDataHora()}`,
            "online"
        );

    } catch (erro) {

        console.error("Erro:", erro);

        mostrarStatus(
            "Não foi possível atualizar os dados",
            "offline"
        );
    }
}


/* =========================================================
   CONSULTAR UMA ABA DO GOOGLE SHEETS
   ========================================================= */

async function carregarAba(nomeAba) {

    const url =
        `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}` +
        `/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(nomeAba)}`;

    const resposta = await fetch(url);

    if (!resposta.ok) {
        throw new Error(
            `Erro ao acessar a aba ${nomeAba}`
        );
    }

    const texto = await resposta.text();

    // Remove o wrapper do Google
    const inicio = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");

    if (inicio === -1 || fim === -1) {
        throw new Error(
            `Resposta inválida da aba ${nomeAba}`
        );
    }

    const json = JSON.parse(
        texto.substring(inicio, fim + 1)
    );

    if (!json.table) {
        throw new Error(
            `Não foi possível ler a aba ${nomeAba}`
        );
    }

    return converterTabela(
        json.table,
        nomeAba
    );
}


/* =========================================================
   CONVERTER GOOGLE SHEETS PARA OBJETOS
   ========================================================= */

function converterTabela(table, nomeAba) {

    const colunas = table.cols.map(
        coluna =>
            coluna.label ||
            coluna.id ||
            ""
    );

    return table.rows.map(row => {

        const registro = {
            _aba: nomeAba
        };

        colunas.forEach((coluna, index) => {

            const celula = row.c?.[index];

            registro[coluna] =
                celula?.f ??
                celula?.v ??
                "";
        });

        return registro;
    });
}


/* =========================================================
   ATUALIZAR INDICADORES
   ========================================================= */

function atualizarIndicadores(dados) {

    if (!dados.length) {

        console.warn(
            "Nenhum registro encontrado."
        );

        atualizarCard(
            1,
            "0",
            "Nenhum chamado encontrado"
        );

        atualizarCard(
            2,
            "0",
            "Nenhum chamado encontrado"
        );

        atualizarCard(
            3,
            "0%",
            "Sem dados para cálculo"
        );

        atualizarCard(
            4,
            "0",
            "Nenhum chamado encontrado"
        );

        return;
    }


    /* -----------------------------------------------------
       LOCALIZAR COLUNA DE DATA
       ----------------------------------------------------- */

    const colunaData =
        encontrarColuna(
            dados,
            [
                "data",
                "data abertura",
                "data de abertura",
                "abertura",
                "aberto em",
                "criação",
                "criacao"
            ]
        );


    if (!colunaData) {

        console.warn(
            "Coluna de data não encontrada."
        );

        console.log(
            "Colunas disponíveis:",
            Object.keys(dados[0])
        );

        mostrarStatus(
            "Coluna de data não identificada",
            "offline"
        );

        return;
    }


    console.log(
        "Coluna utilizada para data:",
        colunaData
    );


    /* -----------------------------------------------------
       FILTRAR DATAS
       ----------------------------------------------------- */

    const chamadosAnterior =
        dados.filter(item =>
            compararData(
                item[colunaData],
                CONFIG.dataAnterior
            )
        );

    const chamadosAtual =
        dados.filter(item =>
            compararData(
                item[colunaData],
                CONFIG.dataAtual
            )
        );


    /* -----------------------------------------------------
       TOTAIS
       ----------------------------------------------------- */

    const totalAnterior =
        chamadosAnterior.length;

    const totalAtual =
        chamadosAtual.length;


    /* -----------------------------------------------------
       ABERTOS NO MESMO DIA
       ----------------------------------------------------- */

    const abertosMesmoDia =
        calcularAbertosMesmoDia(
            chamadosAnterior,
            dados
        );


    /* -----------------------------------------------------
       PERCENTUAL
       ----------------------------------------------------- */

    let percentual = 0;

    if (totalAnterior > 0) {

        percentual =
            (abertosMesmoDia / totalAnterior) * 100;
    }


    /* -----------------------------------------------------
       ATUALIZAR CARDS
       ----------------------------------------------------- */

    atualizarCard(
        1,
        formatarNumero(totalAnterior),
        "Total de chamados — 02/09"
    );


    atualizarCard(
        2,
        formatarNumero(abertosMesmoDia),
        "Chamados abertos no mesmo dia"
    );


    atualizarCard(
        3,
        formatarPercentual(percentual),
        "Percentual sobre o total"
    );


    atualizarCard(
        4,
        formatarNumero(totalAtual),
        "Total de chamados — 03/09"
    );


    /* -----------------------------------------------------
       MOSTRAR ORIGEM DOS DADOS
       ----------------------------------------------------- */

    adicionarOrigemDados();
}


/* =========================================================
   CALCULAR ABERTOS NO MESMO DIA
   ========================================================= */

function calcularAbertosMesmoDia(
    registros,
    todosDados
) {

    if (!registros.length) {
        return 0;
    }


    /*
     * Tenta encontrar uma segunda coluna relacionada
     * à data de abertura/criação.
     */

    const colunaAbertura =
        encontrarColuna(
            registros,
            [
                "data abertura",
                "data de abertura",
                "abertura",
                "aberto em",
                "data abertura os",
                "criação",
                "criacao"
            ]
        );


    /*
     * Se houver coluna específica de abertura,
     * verifica quantos foram abertos em 02/09.
     */

    if (colunaAbertura) {

        return registros.filter(item =>
            compararData(
                item[colunaAbertura],
                CONFIG.dataAnterior
            )
        ).length;
    }


    /*
     * Caso a planilha já represente os chamados
     * pela data de abertura, considera o próprio
     * conjunto como chamados do mesmo dia.
     */

    return registros.length;
}


/* =========================================================
   ENCONTRAR COLUNA
   ========================================================= */

function encontrarColuna(
    dados,
    termos
) {

    if (!dados.length) {
        return null;
    }

    const colunas =
        Object.keys(dados[0])
            .filter(coluna =>
                coluna !== "_aba"
            );


    for (const coluna of colunas) {

        const nome =
            normalizarTexto(coluna);

        for (const termo of termos) {

            if (
                nome.includes(
                    normalizarTexto(termo)
                )
            ) {
                return coluna;
            }
        }
    }

    return null;
}


/* =========================================================
   COMPARAR DATAS
   ========================================================= */

function compararData(
    valor,
    dataEsperada
) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ""
    ) {
        return false;
    }

    const valorNormalizado =
        normalizarData(valor);

    return valorNormalizado === dataEsperada;
}


/* =========================================================
   NORMALIZAR DATA
   ========================================================= */

function normalizarData(valor) {

    let texto =
        String(valor).trim();


    /*
     * Formato:
     * 02/09/2026
     */

    const brasileira =
        texto.match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
        );

    if (brasileira) {

        return texto;
    }


    /*
     * Formato:
     * 2026-09-02
     */

    const iso =
        texto.match(
            /^(\d{4})-(\d{2})-(\d{2})/
        );

    if (iso) {

        return `${iso[3]}/${iso[2]}/${iso[1]}`;
    }


    /*
     * Formato do Google:
     * Date(2026,8,2)
     */

    const google =
        texto.match(
            /Date\((\d+),(\d+),(\d+)\)/
        );

    if (google) {

        const ano =
            google[1];

        const mes =
            String(
                Number(google[2]) + 1
            ).padStart(2, "0");

        const dia =
            String(
                google[3]
            ).padStart(2, "0");

        return `${dia}/${mes}/${ano}`;
    }


    return texto;
}


/* =========================================================
   NORMALIZAR TEXTO
   ========================================================= */

function normalizarTexto(texto) {

    return String(texto)
        .toLowerCase()
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .trim();
}


/* =========================================================
   ATUALIZAR CARD DO HTML
   ========================================================= */

function atualizarCard(
    numero,
    valor,
    legenda
) {

    const cards =
        document.querySelectorAll(
            ".cards .card"
        );

    const card =
        cards[numero - 1];

    if (!card) {
        return;
    }

    const strong =
        card.querySelector("strong");

    const small =
        card.querySelector("small");

    if (strong) {
        strong.textContent = valor;
    }

    if (small) {
        small.textContent = legenda;
    }
}


/* =========================================================
   ADICIONAR ORIGEM DOS DADOS
   ========================================================= */

function adicionarOrigemDados() {

    let elemento =
        document.querySelector(
            "#sheet-source"
        );

    if (!elemento) {

        elemento =
            document.createElement("div");

        elemento.id =
            "sheet-source";

        document.body.appendChild(
            elemento
        );
    }

    elemento.innerHTML =
        "Fonte: AR CONDICIONADO + ELETRODOMÉSTICOS";
}


/* =========================================================
   STATUS
   ========================================================= */

function mostrarStatus(
    mensagem,
    tipo
) {

    let status =
        document.querySelector(
            "#sheet-status"
        );

    if (!status) {

        status =
            document.createElement("div");

        status.id =
            "sheet-status";

        document.body.appendChild(
            status
        );
    }

    status.textContent =
        "● " + mensagem;

    status.className =
        `sheet-status ${tipo}`;
}


/* =========================================================
   DATA/HORA DA ATUALIZAÇÃO
   ========================================================= */

function formatarDataHora() {

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(
        new Date()
    );
}


/* =========================================================
   FORMATAÇÃO NUMÉRICA
   ========================================================= */

function formatarNumero(numero) {

    return new Intl.NumberFormat(
        "pt-BR"
    ).format(numero);
}


/* =========================================================
   FORMATAÇÃO DE PERCENTUAL
   ========================================================= */

function formatarPercentual(valor) {

    return new Intl.NumberFormat(
        "pt-BR",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(valor) + "%";
}