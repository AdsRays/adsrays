import React from "react";
import { Document, Page, Text, StyleSheet } from "@react-pdf/renderer";

// Стили с вашим кастомным шрифтом NotoSans
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "NotoSans",
  },
  text: {
    fontSize: 18,
    textAlign: "center",
    marginTop: 100,
    fontFamily: "NotoSans",
  },
});

function PDFReport({ formData, campaignHistory }) {
  const today = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    // Отключаем сжатие, чтобы PDFKit не требовал zlib-полифилл
    <Document compress={false}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.text}>Привет Мир — {today}</Text>
        {/* …ваш остальной контент… */}
      </Page>
    </Document>
  );
}

export default PDFReport;
